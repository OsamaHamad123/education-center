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
import { makeCenterSettings, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";

/**
 * The academic calendar (§16 question 7; `drizzle/0017`).
 *
 * Three questions, and only the first is the usual one:
 *
 *   1. who may write it? (the centre's calendar is the owner's)
 *   2. can it be read with NO session at all? (the public lookup does exactly that)
 *   3. can it contradict itself? (two terms on one day would give "the current term"
 *      two answers, and the database must refuse that, not the form)
 */

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

async function term(name: string, start: string, end: string) {
  const [row] = await ownerDb
    .insert(schema.academicTerms)
    .values({ name, startDate: start, endDate: end })
    .returning();
  if (!row) throw new Error("term fixture failed");
  return row;
}

describe("who may change the calendar", () => {
  it("lets a super admin write one", async () => {
    await asTenant(ctxFor.superAdmin(), (tx) =>
      tx.insert(schema.academicTerms).values({
        name: "الفصل الأول",
        startDate: "2026-09-01",
        endDate: "2027-01-15",
      }),
    );
    expect(await appDb.select().from(schema.academicTerms)).toHaveLength(1);
  });

  it("refuses a branch admin", async () => {
    // The academic calendar comes from the ministry and the branches share it. A branch
    // editing it would be one branch deciding the centre's year.
    await expect(
      asTenant(ctxFor.branchAdmin(fx.branchA.id), (tx) =>
        tx.insert(schema.academicTerms).values({
          name: "فصل الفرع",
          startDate: "2026-09-01",
          endDate: "2027-01-15",
        }),
      ),
    ).rejects.toThrow();
  });

  it("refuses a teacher", async () => {
    await expect(
      asTenant(ctxFor.teacher(fx.teacherA.id), (tx) =>
        tx.insert(schema.academicTerms).values({
          name: "فصل المعلم",
          startDate: "2026-09-01",
          endDate: "2027-01-15",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("who may read it", () => {
  it("is readable with NO tenant context — the public lookup has none", async () => {
    await term("الفصل الأول", "2026-09-01", "2027-01-15");

    // The same connection state an anonymous request has. Term dates are on a poster in
    // the entrance, and the lookup's "الفصل" figure cannot mean anything without them.
    const rows = await appDb.select().from(schema.academicTerms);
    expect(rows).toHaveLength(1);
  });

  it("is readable by a branch admin and by a teacher", async () => {
    await term("الفصل الأول", "2026-09-01", "2027-01-15");

    for (const ctx of [ctxFor.branchAdmin(fx.branchA.id), ctxFor.teacher(fx.teacherA.id)]) {
      const rows = await asTenant(ctx, (tx) => tx.select().from(schema.academicTerms));
      expect(rows).toHaveLength(1);
    }
  });
});

describe("the calendar cannot contradict itself", () => {
  it("refuses two terms that overlap", async () => {
    await term("الفصل الأول", "2026-09-01", "2027-01-15");

    // "The current term" has to have exactly one answer. The form checks this too, so
    // the message is Arabic; THIS is what makes it true.
    await expect(term("فصل آخر", "2026-12-01", "2027-03-01")).rejects.toThrow();
  });

  it("refuses two terms that merely touch on one day", async () => {
    await term("الفصل الأول", "2026-09-01", "2027-01-15");
    // Inclusive at both ends: the 15th is a school day of the first term.
    await expect(term("الفصل الثاني", "2027-01-15", "2027-06-10")).rejects.toThrow();
  });

  it("accepts two terms with a gap between them", async () => {
    await term("الفصل الأول", "2026-09-01", "2027-01-15");
    await term("الفصل الثاني", "2027-02-01", "2027-06-10");
    expect(await appDb.select().from(schema.academicTerms)).toHaveLength(2);
  });

  it("refuses a backwards term", async () => {
    await expect(term("مقلوب", "2027-02-01", "2026-09-01")).rejects.toThrow();
  });
});

describe("a term is only a label", () => {
  it("can be deleted, and takes no attendance or money with it", async () => {
    const first = await term("الفصل الأول", "2026-09-01", "2027-01-15");

    // Nothing in this product is stored against a term id — attendance, invoices and
    // payslips are all stored against DATES — so removing a label is safe in a way
    // nothing else in this codebase is.
    const countMarks = async () => {
      const rows = await appDb.execute<{ count: number }>(
        sql`select count(*)::int as count from attendance_records`,
      );
      return rows[0]?.count ?? 0;
    };
    const before = await countMarks();
    await asTenant(ctxFor.superAdmin(), (tx) => tx.delete(schema.academicTerms).where(sql`id = ${first.id}`));
    const after = await countMarks();

    expect(await appDb.select().from(schema.academicTerms)).toEqual([]);
    expect(after).toBe(before);
  });
});
