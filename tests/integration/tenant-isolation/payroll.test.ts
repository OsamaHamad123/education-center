import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, asTenant, closeConnections, ctxFor, ownerDb, resetDatabase } from "../helpers/db";
import { makeCenterSettings, makeSession, makeTeacher, makeTwoBranches } from "../helpers/factories";
import * as schema from "@/shared/db/schema";
import { reconcileEarnings, type PayrollFilters } from "@/modules/payroll";
import { todayInCairo } from "@/shared/lib/time";

/**
 * Payroll (PROJECT_PLAN 10.6, Phase 8 acceptance).
 *
 * Three things are under test and they are different in kind:
 *
 *   1. The SQL aggregate and the pure `calculateEarnings` agree. The report sums in
 *      the database for speed; the domain function is the definition of the rules.
 *      Two implementations of one rule is a liability unless something checks them
 *      against each other, so this file does.
 *   2. Changing a rate after the fact does not move a past total — the whole reason
 *      `rate_applied_piasters` exists.
 *   3. A branch admin's payroll is their branch's share of a shared teacher, and
 *      they cannot widen it. That is RLS, not a filter, so it is tested through the
 *      app role.
 */

let fx: Awaited<ReturnType<typeof makeTwoBranches>>;
const TODAY = todayInCairo();

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

const RANGE = { from: "2000-01-01", to: "2100-01-01" };

/** The SQL half of the report, the way the screen reads it. */
async function sqlEarnings(ctx: Parameters<typeof asTenant>[0], filters: PayrollFilters) {
  return asTenant(ctx, async (tx) => (await reconcileEarnings(ctx, tx, filters)).domain);
}

describe("the SQL aggregate and the domain function", () => {
  it("agree on a mixed set of sessions", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });

    // A deliberately awkward spread: two branches, two tracks, three rates, and a
    // cancelled session that must not count.
    const plan = [
      {
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        track: "scientific" as const,
        rate: 15_000,
        period: 1,
      },
      {
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        track: "scientific" as const,
        rate: 25_000,
        period: 2,
      },
      { branchId: fx.branchA.id, classId: fx.classA.id, track: "literary" as const, rate: 12_000, period: 3 },
      { branchId: fx.branchB.id, classId: fx.classB.id, track: "literary" as const, rate: 12_000, period: 1 },
      {
        branchId: fx.branchB.id,
        classId: fx.classB.id,
        track: "scientific" as const,
        rate: 30_000,
        period: 2,
      },
    ];

    for (const item of plan) {
      await makeSession({
        branchId: item.branchId,
        classId: item.classId,
        teacherId: shared.id,
        periodNumber: item.period,
        ratePiasters: item.rate,
        track: item.track,
      });
    }

    const cancelled = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      periodNumber: 4,
      ratePiasters: 99_000,
    });
    await ownerDb
      .update(schema.classSessions)
      .set({ status: "cancelled", cancelReason: "غياب المعلم" })
      .where(sql`id = ${cancelled.id}`);

    const ctx = ctxFor.superAdmin(null);
    const result = await asTenant(ctx, (tx) =>
      reconcileEarnings(ctx, tx, { ...RANGE, teacherId: shared.id }),
    );

    // 15 + 25 + 12 + 12 + 30 = 94 thousand piasters, and the cancelled 99 is absent.
    expect(result.sqlPiasters).toBe(94_000);
    expect(result.agrees).toBe(true);
    expect(result.domain.amountPiasters).toBe(result.sqlPiasters);
    expect(result.domain.sessions).toBe(result.sqlSessions);
    // Branch by branch, not merely in the grand total.
    expect(result.domain.branches.map((branch) => branch.amountPiasters).sort()).toEqual(
      [42_000, 52_000].sort(),
    );
  });

  it("agree that a teacher with nothing is owed nothing", async () => {
    const ctx = ctxFor.superAdmin(null);
    const result = await asTenant(ctx, (tx) =>
      reconcileEarnings(ctx, tx, { ...RANGE, teacherId: fx.teacherA.id }),
    );

    expect(result.agrees).toBe(true);
    expect(result.sqlPiasters).toBe(0);
    expect(result.domain.amountPiasters).toBe(0);
  });

  it("agree when EVERY session in the range was cancelled", async () => {
    const session = await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      ratePiasters: 15_000,
    });
    await ownerDb
      .update(schema.classSessions)
      .set({ status: "cancelled", cancelReason: "إجازة" })
      .where(sql`id = ${session.id}`);

    const ctx = ctxFor.superAdmin(null);
    const result = await asTenant(ctx, (tx) => reconcileEarnings(ctx, tx, RANGE));

    expect(result.agrees).toBe(true);
    expect(result.sqlPiasters).toBe(0);
    expect(result.domain).toEqual({ branches: [], sessions: 0, amountPiasters: 0 });
  });
});

describe("an independent verification query (Phase 8 acceptance)", () => {
  it("matches the report, computed a third way", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    for (const [index, rate] of [15_000, 25_000, 12_000].entries()) {
      await makeSession({
        branchId: fx.branchA.id,
        classId: fx.classA.id,
        teacherId: shared.id,
        periodNumber: index + 1,
        ratePiasters: rate,
      });
    }

    const ctx = ctxFor.superAdmin(fx.branchA.id);

    // Deliberately NOT the repository's query: a plain sum, written by hand, the way
    // an accountant would check the figure against the database.
    const [verification] = (await asTenant(ctx, (tx) =>
      tx.execute(sql`
        select coalesce(sum(rate_applied_piasters), 0)::int as piasters, count(*)::int as sessions
        from class_sessions
        where status = 'completed'`),
    )) as unknown as { piasters: number; sessions: number }[];

    const earnings = await sqlEarnings(ctx, RANGE);

    expect(earnings.amountPiasters).toBe(verification?.piasters);
    expect(earnings.sessions).toBe(verification?.sessions);
    expect(earnings.amountPiasters).toBe(52_000);
  });
});

describe("the rate snapshot", () => {
  it("does not move when the teacher's rate changes afterwards (Phase 8 acceptance)", async () => {
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      ratePiasters: 15_000,
    });

    const ctx = ctxFor.superAdmin(fx.branchA.id);
    const before = await sqlEarnings(ctx, RANGE);

    // Double the rate today.
    await asTenant(ctx, (tx) =>
      tx
        .update(schema.teachers)
        .set({ ratePiastersScientific: 30_000 })
        .where(sql`id = ${fx.teacherA.id}`),
    );

    const after = await sqlEarnings(ctx, RANGE);

    expect(after.amountPiasters).toBe(15_000);
    expect(after.amountPiasters).toBe(before.amountPiasters);
  });

  it("prices two sessions either side of a rise at what each was worth", async () => {
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 1,
      ratePiasters: 15_000,
    });
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 2,
      ratePiasters: 25_000,
    });

    const ctx = ctxFor.superAdmin(fx.branchA.id);
    const earnings = await sqlEarnings(ctx, RANGE);

    expect(earnings.amountPiasters).toBe(40_000);
    expect(earnings.sessions).toBe(2);
  });
});

describe("branch isolation", () => {
  it("shows a branch admin only THEIR branch's share of a shared teacher", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      ratePiasters: 15_000,
    });
    await makeSession({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: shared.id,
      ratePiasters: 40_000,
    });

    const ctx = ctxFor.branchAdmin(fx.branchA.id);
    const earnings = await sqlEarnings(ctx, RANGE);

    expect(earnings.branches).toHaveLength(1);
    expect(earnings.branches[0]?.branchId).toBe(fx.branchA.id);
    // Not 55,000. The other branch's money is not theirs to see.
    expect(earnings.amountPiasters).toBe(15_000);
  });

  it("cannot be widened by asking for another branch explicitly", async () => {
    await makeSession({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: fx.teacherB.id,
      ratePiasters: 40_000,
    });

    const ctx = ctxFor.branchAdmin(fx.branchA.id);
    // Even if a crafted request smuggled a branchId past the query layer, RLS is
    // still underneath it and returns nothing.
    const earnings = await sqlEarnings(ctx, { ...RANGE, branchId: fx.branchB.id });

    expect(earnings.branches).toEqual([]);
    expect(earnings.amountPiasters).toBe(0);
  });

  it("gives a teacher their own total across every branch they work in", async () => {
    const shared = await makeTeacher([fx.branchA.id, fx.branchB.id], { fullName: "معلم مشترك" });
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: shared.id,
      ratePiasters: 15_000,
    });
    await makeSession({
      branchId: fx.branchB.id,
      classId: fx.classB.id,
      teacherId: shared.id,
      ratePiasters: 40_000,
    });
    // Somebody else's session, in a branch they work in.
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      periodNumber: 5,
      ratePiasters: 99_000,
    });

    const ctx = ctxFor.teacher(shared.id);
    const earnings = await sqlEarnings(ctx, RANGE);

    // Their own work in both branches, and not a piaster of anyone else's.
    expect(earnings.amountPiasters).toBe(55_000);
    expect(earnings.branches).toHaveLength(2);
  });
});

describe("the date range", () => {
  it("includes both endpoints", async () => {
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      sessionDate: TODAY,
      ratePiasters: 15_000,
    });

    const ctx = ctxFor.superAdmin(fx.branchA.id);
    const inRange = await sqlEarnings(ctx, { from: TODAY, to: TODAY });
    expect(inRange.amountPiasters).toBe(15_000);
  });

  it("excludes a session one day outside it", async () => {
    await makeSession({
      branchId: fx.branchA.id,
      classId: fx.classA.id,
      teacherId: fx.teacherA.id,
      sessionDate: TODAY,
      ratePiasters: 15_000,
    });

    const tomorrow = new Date(`${TODAY}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const after = tomorrow.toISOString().slice(0, 10);

    const ctx = ctxFor.superAdmin(fx.branchA.id);
    expect((await sqlEarnings(ctx, { from: after, to: after })).amountPiasters).toBe(0);
  });
});
