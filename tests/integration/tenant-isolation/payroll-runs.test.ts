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
import { makeCenterSettings, makeSession, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { todayInCairo } from "@/shared/lib/time";

/**
 * Paying the teachers (`drizzle/0016`).
 *
 * The same questions the fee ledger was asked, plus the one that is unique to this
 * table: a teacher must be able to see their OWN settlements — that is the whole point
 * of "شهر ٨: مدفوع" — and must be able to write none.
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

async function runFor(branchId: string, teacherId: string, amount = 150_000, reversesId?: string) {
  const [row] = await ownerDb
    .insert(schema.payrollRuns)
    .values({
      branchId,
      teacherId,
      period: PERIOD,
      amountPiasters: amount,
      sessionsCount: 10,
      ...(reversesId ? { reversesId } : {}),
    })
    .returning();
  if (!row) throw new Error("run fixture failed");
  return row;
}

describe("who can see a settlement", () => {
  it("shows a branch admin only their own branch's", async () => {
    await runFor(fx.branchA.id, fx.teacherA.id);
    await runFor(fx.branchB.id, fx.teacherB.id);

    const mine = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.select().from(schema.payrollRuns),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.branchId).toBe(fx.branchA.id);
  });

  it("shows a TEACHER their own, in every branch they work in", async () => {
    // A teacher has no branch of their own, so this row is reached by the second half
    // of the policy — and it is the half the feature exists for.
    await runFor(fx.branchA.id, fx.teacherA.id);
    await runFor(fx.branchB.id, fx.teacherB.id);

    const mine = await asTenant(ctxFor.teacher(fx.teacherA.id), (tx) => tx.select().from(schema.payrollRuns));
    expect(mine).toHaveLength(1);
    expect(mine[0]?.teacherId).toBe(fx.teacherA.id);
  });

  it("shows a teacher nothing of another teacher's", async () => {
    await runFor(fx.branchA.id, fx.teacherA.id);

    const theirs = await asTenant(ctxFor.teacher(fx.teacherB.id), (tx) =>
      tx.select().from(schema.payrollRuns),
    );
    expect(theirs).toEqual([]);
  });

  it("refuses a teacher writing one for themselves", async () => {
    await expect(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.payrollRuns).values({
          branchId: fx.branchA.id,
          teacherId: fx.teacherA.id,
          period: PERIOD,
          amountPiasters: 999_999,
          sessionsCount: 1,
        }),
      ),
      // Reading your own payslip and writing it are not the same permission.
    ).rejects.toThrow();
  });
});

describe("a settlement cannot be edited or deleted", () => {
  it("refuses both from the application role", async () => {
    const run = await runFor(fx.branchA.id, fx.teacherA.id);

    await expect(
      appDb.execute(sql`update payroll_runs set amount_piasters = 1 where id = ${run.id}`),
    ).rejects.toThrow();
    await expect(appDb.execute(sql`delete from payroll_runs where id = ${run.id}`)).rejects.toThrow();
  });

  it("takes a reversal instead, and only one per settlement", async () => {
    const run = await runFor(fx.branchA.id, fx.teacherA.id, 150_000);
    await runFor(fx.branchA.id, fx.teacherA.id, -150_000, run.id);

    // Undoing the same payout twice would show the centre owing a month it has paid.
    await expect(runFor(fx.branchA.id, fx.teacherA.id, -150_000, run.id)).rejects.toThrow();
  });

  it("refuses a negative row that reverses nothing", async () => {
    await expect(runFor(fx.branchA.id, fx.teacherA.id, -150_000)).rejects.toThrow();
  });
});

describe("the freeze", () => {
  /**
   * The consequence worth more than the record: once a month is paid, its registers
   * stop being editable for that teacher. Tested here as the DATA the guard reads —
   * the guard's own arithmetic is unit-tested in `domain/settlement.test.ts`, and the
   * refusal is tested end to end.
   */
  it("reads as settled once money is out the door, and open again after a reversal", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
    });
    expect(session.sessionDate.slice(0, 7)).toBe(PERIOD);

    const settled = async () => {
      const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.execute<{ total: number }>(
          sql`select coalesce(sum(amount_piasters), 0)::int as total from payroll_runs
              where branch_id = ${fx.branchA.id} and teacher_id = ${fx.teacherA.id}
                and period = ${PERIOD}`,
        ),
      );
      return (rows[0]?.total ?? 0) > 0;
    };

    expect(await settled()).toBe(false);
    const run = await runFor(fx.branchA.id, fx.teacherA.id);
    expect(await settled()).toBe(true);

    await runFor(fx.branchA.id, fx.teacherA.id, -150_000, run.id);
    // A settlement recorded by mistake must not lock a month for ever.
    expect(await settled()).toBe(false);
  });

  it("does not freeze another teacher's month in the same branch", async () => {
    await runFor(fx.branchA.id, fx.teacherA.id);

    const rows = await asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
      tx.execute<{ total: number }>(
        sql`select coalesce(sum(amount_piasters), 0)::int as total from payroll_runs
            where branch_id = ${fx.branchA.id} and teacher_id = ${fx.teacherB.id}
              and period = ${PERIOD}`,
      ),
    );
    expect(rows[0]?.total ?? 0).toBe(0);
  });
});
