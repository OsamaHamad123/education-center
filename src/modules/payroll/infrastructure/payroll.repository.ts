import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  branches,
  classes,
  classSessions,
  payrollRuns,
  teacherBranches,
  teachers,
  type Track,
} from "@/shared/db/schema";

/**
 * Payroll reads `class_sessions` and nothing else that carries money. The rate and
 * the track come from the row's own snapshot columns, never from a join to
 * `teachers` — joining would quietly re-price history the moment a rate changed.
 *
 * The totals are summed in SQL (PROJECT_PLAN Phase 8 prompt): a term's payroll for a
 * branch is tens of thousands of rows, and pulling them into Node to reduce over
 * would be slow and would need paging that a total cannot survive.
 *
 * RLS does the branch scoping. A branch admin's query returns only their branch's
 * rows, so a shared teacher's total here IS their branch's share — no filter written
 * in TypeScript stands between them and another branch's money.
 */

export type PayrollFilters = {
  from: string;
  to: string;
  teacherId?: string | undefined;
  /** A super admin may narrow to one branch; everyone else is narrowed by RLS. */
  branchId?: string | undefined;
};

export type EarningsGroup = {
  teacherId: string;
  teacherName: string;
  branchId: string;
  branchName: string | null;
  track: Track;
  sessions: number;
  amountPiasters: number;
};

function filtersToWhere(filters: PayrollFilters) {
  const where = [
    gte(classSessions.sessionDate, filters.from),
    lte(classSessions.sessionDate, filters.to),
    // Cancelled sessions keep their attendance and leave payroll (rule 10.5).
    eq(classSessions.status, "completed"),
  ];
  if (filters.teacherId) where.push(eq(classSessions.teacherId, filters.teacherId));
  if (filters.branchId) where.push(eq(classSessions.branchId, filters.branchId));
  return and(...where);
}

/** Teacher × branch × track, summed in the database. */
export async function aggregateEarnings(
  _ctx: TenantContext,
  tx: Tx,
  filters: PayrollFilters,
): Promise<EarningsGroup[]> {
  return tx
    .select({
      teacherId: classSessions.teacherId,
      teacherName: teachers.fullName,
      branchId: classSessions.branchId,
      branchName: branches.name,
      track: classSessions.trackApplied,
      sessions: sql<number>`count(*)::int`,
      // bigint would arrive as a string; payroll totals fit in an int comfortably
      // (21 million EGP), and an explicit cast beats a silent string concatenation.
      amountPiasters: sql<number>`coalesce(sum(${classSessions.rateAppliedPiasters}), 0)::int`,
    })
    .from(classSessions)
    .innerJoin(teachers, eq(teachers.id, classSessions.teacherId))
    .leftJoin(branches, eq(branches.id, classSessions.branchId))
    .where(filtersToWhere(filters))
    .groupBy(
      classSessions.teacherId,
      teachers.fullName,
      classSessions.branchId,
      branches.name,
      classSessions.trackApplied,
    )
    .orderBy(asc(teachers.fullName), asc(branches.name), asc(classSessions.trackApplied));
}

export type PayrollSessionRow = {
  id: string;
  sessionDate: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  className: string;
  branchName: string | null;
  track: Track;
  amountPiasters: number;
  isExtra: boolean;
};

/** The drill-down: which lessons make up one teacher's total (rule 10.6). */
export async function listPaidSessions(
  _ctx: TenantContext,
  tx: Tx,
  filters: PayrollFilters & { teacherId: string },
  limit: number,
): Promise<PayrollSessionRow[]> {
  return tx
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      periodNumber: classSessions.periodNumber,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      subjectName: classSessions.subjectName,
      className: classes.name,
      branchName: branches.name,
      track: classSessions.trackApplied,
      amountPiasters: classSessions.rateAppliedPiasters,
      isExtra: classSessions.isExtra,
    })
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .leftJoin(branches, eq(branches.id, classSessions.branchId))
    .where(filtersToWhere(filters))
    .orderBy(desc(classSessions.sessionDate), asc(classSessions.periodNumber))
    .limit(limit);
}

/**
 * The same sessions, unaggregated, in exactly the shape `calculateEarnings` expects.
 *
 * Used only by `reconcileEarnings`, which holds the SQL sum and the domain function to
 * each other. The report itself never calls this: pulling a term of rows into Node to
 * reduce over is the thing the aggregate exists to avoid. Cancelled sessions are
 * deliberately included, so the domain function's own exclusion rule is exercised.
 */
export async function listSessionsForDomainCheck(
  _ctx: TenantContext,
  tx: Tx,
  filters: PayrollFilters,
): Promise<{ track: Track; ratePiasters: number; status: "completed" | "cancelled"; branchId: string }[]> {
  const where = [gte(classSessions.sessionDate, filters.from), lte(classSessions.sessionDate, filters.to)];
  if (filters.teacherId) where.push(eq(classSessions.teacherId, filters.teacherId));
  if (filters.branchId) where.push(eq(classSessions.branchId, filters.branchId));

  return tx
    .select({
      track: classSessions.trackApplied,
      ratePiasters: classSessions.rateAppliedPiasters,
      status: classSessions.status,
      branchId: classSessions.branchId,
    })
    .from(classSessions)
    .where(and(...where));
}

/** Teachers the viewer may filter by. RLS narrows this to their own branch's links. */
export async function listPayrollTeachers(
  _ctx: TenantContext,
  tx: Tx,
): Promise<{ id: string; fullName: string }[]> {
  return tx
    .selectDistinct({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .orderBy(asc(teachers.fullName));
}

export async function listPayrollBranches(
  _ctx: TenantContext,
  tx: Tx,
): Promise<{ id: string; name: string }[]> {
  return tx
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.name));
}

/** The branches one teacher actually works in, for the portal's own earnings view. */
export async function listTeacherBranchIds(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ branchId: teacherBranches.branchId })
    .from(teacherBranches)
    .where(and(eq(teacherBranches.teacherId, teacherId), eq(teacherBranches.isActive, true)));
  return rows.map((row) => row.branchId);
}

export async function findBranchNames(
  _ctx: TenantContext,
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(inArray(branches.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// --- settlements: what has actually been PAID ---------------------------------

/**
 * Every settlement row for a month, keyed `branchId:teacherId` (`drizzle/0016`).
 *
 * Reversals come back with the settlements they undo, because "is this month settled"
 * is the SUM of both and not the presence of either.
 */
export async function listRunsForPeriod(
  _ctx: TenantContext,
  tx: Tx,
  period: string,
): Promise<Map<string, RunRow[]>> {
  const rows = await tx
    .select({
      id: payrollRuns.id,
      branchId: payrollRuns.branchId,
      teacherId: payrollRuns.teacherId,
      amountPiasters: payrollRuns.amountPiasters,
      sessionsCount: payrollRuns.sessionsCount,
      reversesId: payrollRuns.reversesId,
      paidAt: payrollRuns.paidAt,
      note: payrollRuns.note,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.period, period))
    .orderBy(desc(payrollRuns.paidAt));

  const byPair = new Map<string, RunRow[]>();
  for (const row of rows) {
    const key = `${row.branchId}:${row.teacherId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), row]);
  }
  return byPair;
}

export type RunRow = {
  id: string;
  branchId: string;
  teacherId: string;
  amountPiasters: number;
  sessionsCount: number;
  reversesId: string | null;
  paidAt: Date;
  note: string | null;
};

/** The settlements for ONE teacher's month — what the freeze and the badge both read. */
export async function listRunsFor(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  teacherId: string,
  period: string,
): Promise<RunRow[]> {
  return tx
    .select({
      id: payrollRuns.id,
      branchId: payrollRuns.branchId,
      teacherId: payrollRuns.teacherId,
      amountPiasters: payrollRuns.amountPiasters,
      sessionsCount: payrollRuns.sessionsCount,
      reversesId: payrollRuns.reversesId,
      paidAt: payrollRuns.paidAt,
      note: payrollRuns.note,
    })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.branchId, branchId),
        eq(payrollRuns.teacherId, teacherId),
        eq(payrollRuns.period, period),
      ),
    );
}

/** Every settlement a teacher can see for themselves, newest month first. */
export async function listRunsForTeacher(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<(RunRow & { period: string })[]> {
  return tx
    .select({
      id: payrollRuns.id,
      branchId: payrollRuns.branchId,
      teacherId: payrollRuns.teacherId,
      period: payrollRuns.period,
      amountPiasters: payrollRuns.amountPiasters,
      sessionsCount: payrollRuns.sessionsCount,
      reversesId: payrollRuns.reversesId,
      paidAt: payrollRuns.paidAt,
      note: payrollRuns.note,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.teacherId, teacherId))
    .orderBy(desc(payrollRuns.period), desc(payrollRuns.paidAt));
}

export async function insertRun(
  ctx: TenantContext,
  tx: Tx,
  values: {
    branchId: string;
    teacherId: string;
    period: string;
    amountPiasters: number;
    sessionsCount: number;
    note: string | null;
    reversesId?: string | null;
  },
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(payrollRuns)
    .values({ ...values, paidBy: ctx.userId })
    .returning({ id: payrollRuns.id });
  if (!row) throw new Error("insertRun returned no row");
  return row;
}

export async function findRun(
  _ctx: TenantContext,
  tx: Tx,
  runId: string,
): Promise<(RunRow & { period: string }) | null> {
  const [row] = await tx
    .select({
      id: payrollRuns.id,
      branchId: payrollRuns.branchId,
      teacherId: payrollRuns.teacherId,
      amountPiasters: payrollRuns.amountPiasters,
      sessionsCount: payrollRuns.sessionsCount,
      reversesId: payrollRuns.reversesId,
      paidAt: payrollRuns.paidAt,
      note: payrollRuns.note,
      period: payrollRuns.period,
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.id, runId))
    .limit(1);
  return row ?? null;
}

/** The period a run covers — needed when reversing one. */
export async function findRunPeriod(_ctx: TenantContext, tx: Tx, runId: string): Promise<string | null> {
  const [row] = await tx
    .select({ period: payrollRuns.period })
    .from(payrollRuns)
    .where(eq(payrollRuns.id, runId))
    .limit(1);
  return row?.period ?? null;
}
