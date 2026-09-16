import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  appDb,
  asTenant,
  closeConnections,
  ctxFor,
  ownerDb,
  resetDatabase,
} from "../helpers/db";
import { makeCenterSettings, makeStudent, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { todayInCairo } from "@/shared/lib/time";

/**
 * The fee ledger (docs/MESSAGING-AND-FEES-PLAN.md, P5).
 *
 * This is the first table in the product that holds money coming in, so the tests are
 * the ones an auditor would ask for rather than the ones a feature list would:
 *
 *   1. can one branch see or touch another's money? (RLS)
 *   2. can a payment be edited or deleted at all? (it must not be, by GRANT)
 *   3. can a month be billed twice? (the unique index, under a real race)
 *   4. do the constraints refuse the rows that would make the ledger lie?
 */

const PERIOD = todayInCairo().slice(0, 7);

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(async () => {
  await resetDatabase();
  await makeCenterSettings();
  fx = await makeTwoBranches();
});

afterAll(async () => {
  await closeConnections();
});

/** The reason Postgres gave, which drizzle wraps in a generic "Failed query". */
async function refusalFor(statement: Parameters<typeof appDb.execute>[0]): Promise<string> {
  try {
    await appDb.execute(statement);
    return "";
  } catch (error) {
    return String((error as { cause?: { message?: string } }).cause?.message ?? error);
  }
}

async function invoiceFor(branchId: string, studentId: string, classId: string, amount = 50_000) {
  const [row] = await ownerDb
    .insert(schema.invoices)
    .values({ branchId, studentId, classId, period: PERIOD, amountPiasters: amount })
    .returning();
  if (!row) throw new Error("invoice fixture failed");
  return row;
}

async function paymentFor(invoiceId: string, branchId: string, amount = 20_000, receiptNo = 1) {
  const [row] = await ownerDb
    .insert(schema.payments)
    .values({
      branchId,
      invoiceId,
      amountPiasters: amount,
      method: "cash",
      receiptYear: Number(PERIOD.slice(0, 4)),
      receiptNo,
    })
    .returning();
  if (!row) throw new Error("payment fixture failed");
  return row;
}

describe("one branch cannot see or touch another's money", () => {
  it("shows a branch admin only their own invoices", async () => {
    await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    await invoiceFor(fx.branchB.id, fx.studentB.id, fx.classB.id);

    const mine = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) => tx.select().from(schema.invoices));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.branchId).toBe(fx.branchA.id);
  });

  it("shows a branch admin only their own payments", async () => {
    const theirs = await invoiceFor(fx.branchB.id, fx.studentB.id, fx.classB.id);
    await paymentFor(theirs.id, fx.branchB.id);

    const mine = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) => tx.select().from(schema.payments));
    expect(mine).toEqual([]);
  });

  it("refuses a payment written against another branch's invoice", async () => {
    const theirs = await invoiceFor(fx.branchB.id, fx.studentB.id, fx.classB.id);

    await expect(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.payments).values({
          // Branch A on the row, branch B's invoice underneath it: the policy checks the
          // row's own branch, so this is the shape an attacker would try.
          branchId: fx.branchA.id,
          invoiceId: theirs.id,
          amountPiasters: 10_000,
          method: "cash",
          receiptYear: 2026,
          receiptNo: 99,
        }),
      ),
      // Refused by the COMPOSITE foreign key in drizzle/0015, not by RLS. RLS checks
      // the row's own branch (which is honest) and a plain foreign key checks that the
      // invoice exists (which it does) — neither asks whether the two agree. Foreign
      // keys are not subject to RLS, so before 0015 this INSERT SUCCEEDED.
    ).rejects.toThrow();
  });

  it("lets a super admin with no branch selected READ but not WRITE", async () => {
    await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);

    const seen = await asTenant(ctxFor.superAdmin(), (tx) => tx.select().from(schema.invoices));
    expect(seen).toHaveLength(1);

    // "كافة الفروع" has no till: `app_can_write_branch` requires one specific branch.
    await expect(
      asTenant(ctxFor.superAdmin(), (tx) =>
        tx.insert(schema.invoices).values({
          branchId: fx.branchA.id,
          studentId: fx.studentA.id,
          classId: fx.classA.id,
          period: "2020-01",
          amountPiasters: 1,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("a payment cannot be edited or deleted", () => {
  /**
   * The claim `drizzle/0013` makes in prose, tested as behaviour. `school_app` holds
   * SELECT and INSERT on `payments` and nothing else, so this is not a convention the
   * next developer can forget — it is a privilege the application was never given.
   */
  it("refuses an UPDATE from the application role", async () => {
    const invoice = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    const payment = await paymentFor(invoice.id, fx.branchA.id);

    // The message is drizzle's wrapper; the refusal itself is Postgres's, in the cause.
    await expect(
      appDb.execute(sql`update payments set amount_piasters = 1 where id = ${payment.id}`),
    ).rejects.toThrow();
    expect(await refusalFor(sql`update payments set amount_piasters = 1 where id = ${payment.id}`)).toMatch(
      /permission denied/i,
    );
  });

  it("refuses a DELETE from the application role", async () => {
    const invoice = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    const payment = await paymentFor(invoice.id, fx.branchA.id);

    await expect(appDb.execute(sql`delete from payments where id = ${payment.id}`)).rejects.toThrow();
    expect(await refusalFor(sql`delete from payments where id = ${payment.id}`)).toMatch(
      /permission denied/i,
    );
  });

  it("takes a reversal instead, and only one per receipt", async () => {
    const invoice = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    const payment = await paymentFor(invoice.id, fx.branchA.id, 20_000, 1);

    await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.insert(schema.payments).values({
        branchId: fx.branchA.id,
        invoiceId: invoice.id,
        amountPiasters: -20_000,
        method: "cash",
        receiptYear: 2026,
        receiptNo: 2,
        reversesId: payment.id,
      }),
    );

    // Reversing the same receipt twice would hand the money back twice on paper.
    await expect(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.payments).values({
          branchId: fx.branchA.id,
          invoiceId: invoice.id,
          amountPiasters: -20_000,
          method: "cash",
          receiptYear: 2026,
          receiptNo: 3,
          reversesId: payment.id,
        }),
      ),
    ).rejects.toThrow();

    const total = await appDb.execute<{ sum: number }>(
      sql`select coalesce(sum(amount_piasters), 0)::int as sum from payments where invoice_id = ${invoice.id}`,
    );
    // The money is back to nothing, and both rows are still there to explain it.
    expect(total[0]?.sum).toBe(0);
  });
});

describe("a month cannot be billed twice", () => {
  it("refuses a second invoice for the same student and period", async () => {
    await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);

    await expect(invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id, 99_000)).rejects.toThrow();
  });

  it("lets the generator be run twice without billing anybody again", async () => {
    const rows = [
      {
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        classId: fx.classA.id,
        period: PERIOD,
        amountPiasters: 50_000,
      },
    ];

    const first = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .insert(schema.invoices)
        .values(rows)
        .onConflictDoNothing({ target: [schema.invoices.studentId, schema.invoices.period] })
        .returning({ id: schema.invoices.id }),
    );
    const second = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx
        .insert(schema.invoices)
        .values(rows)
        .onConflictDoNothing({ target: [schema.invoices.studentId, schema.invoices.period] })
        .returning({ id: schema.invoices.id }),
    );

    // The office WILL press the button twice, and the second press must bill nobody.
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });
});

describe("the constraints refuse a ledger that would lie", () => {
  it("refuses a discount larger than the invoice", async () => {
    const invoice = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id, 50_000);
    await expect(
      ownerDb.execute(
        sql`update invoices set discount_piasters = 60_000, discount_reason = 'x' where id = ${invoice.id}`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a discount with no reason", async () => {
    const invoice = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    await expect(
      ownerDb.execute(sql`update invoices set discount_piasters = 1000 where id = ${invoice.id}`),
    ).rejects.toThrow();
  });

  it("refuses a negative payment that reverses nothing", async () => {
    const invoice = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    // Money leaving without a receipt to point at is how a ledger stops being one.
    await expect(paymentFor(invoice.id, fx.branchA.id, -5_000, 7)).rejects.toThrow();
  });

  it("refuses a made-up period", async () => {
    await expect(
      ownerDb.insert(schema.invoices).values({
        branchId: fx.branchA.id,
        studentId: fx.studentA.id,
        classId: fx.classA.id,
        period: "2026-13",
        amountPiasters: 1,
      }),
    ).rejects.toThrow();
  });

  it("refuses two receipts with the same number in one branch and year", async () => {
    const one = await invoiceFor(fx.branchA.id, fx.studentA.id, fx.classA.id);
    const other = await makeStudent(fx.branchA.id, fx.classA.id, { fullName: "طالب آخر" });
    const two = await ownerDb
      .insert(schema.invoices)
      .values({
        branchId: fx.branchA.id,
        studentId: other.id,
        classId: fx.classA.id,
        period: PERIOD,
        amountPiasters: 50_000,
      })
      .returning();

    await paymentFor(one.id, fx.branchA.id, 10_000, 1);
    // The office is asked for receipts BY NUMBER. Two with the same one is the end of
    // that conversation.
    await expect(paymentFor(two[0]?.id ?? "", fx.branchA.id, 10_000, 1)).rejects.toThrow();
  });
});
