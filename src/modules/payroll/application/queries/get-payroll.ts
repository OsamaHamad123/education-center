import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import type { BranchEarnings, Earnings } from "../../domain/calculate-earnings";
import {
  aggregateEarnings,
  listPaidSessions,
  listPayrollBranches,
  listPayrollTeachers,
  type EarningsGroup,
  type PayrollSessionRow,
} from "../../infrastructure/payroll.repository";

/**
 * The payroll report (PROJECT_PLAN 10.6): teacher → branch → track, with a drill-down.
 *
 * The totals are summed in SQL; this file only reshapes the grouped rows into the
 * structure `calculateEarnings` defines, so the report and the domain function speak
 * the same language. An integration test runs both over the same sessions.
 *
 * Nothing here filters by branch for a branch admin. RLS does that, which is why a
 * shared teacher's row shows their work in THIS branch and there is no code path
 * that could accidentally widen it.
 */

export type TeacherEarnings = {
  teacherId: string;
  teacherName: string;
  earnings: Earnings;
  /** Branch names, so the view never has to look an id up. */
  branchNames: Record<string, string>;
};

export type PayrollReport = {
  from: string;
  to: string;
  teacherId: string | null;
  branchId: string | null;
  teachers: TeacherEarnings[];
  totalSessions: number;
  totalPiasters: number;
  /** Pickers. Both are already narrowed by RLS for a branch admin. */
  teacherOptions: { id: string; fullName: string }[];
  branchOptions: { id: string; name: string }[];
  /** True when the viewer may choose a branch at all (rule 10.6 report inputs). */
  canChooseBranch: boolean;
};

export async function getPayrollReport(input: {
  from?: string | undefined;
  to?: string | undefined;
  teacherId?: string | undefined;
  branchId?: string | undefined;
}): Promise<Result<PayrollReport>> {
  const auth = await requirePermission("payroll.read");
  if (!auth.ok) return auth;

  const today = todayInCairo();
  const from = input.from ?? startOfMonth(today);
  const to = input.to ?? today;
  if (from > to) return err("VALIDATION_ERROR", ar.payroll.rangeBackwards);

  // A branch admin's own branch is not a "filter" they chose — it is their scope, and
  // passing it explicitly would imply they could pass a different one.
  const branchId = auth.data.role === "super_admin" ? input.branchId : undefined;

  return withTenant(auth.data, async (tx) => {
    const groups = await aggregateEarnings(auth.data, tx, {
      from,
      to,
      teacherId: input.teacherId,
      branchId,
    });

    const teachers = groupByTeacher(groups);

    return ok({
      from,
      to,
      teacherId: input.teacherId ?? null,
      branchId: branchId ?? null,
      teachers,
      totalSessions: teachers.reduce((total, t) => total + t.earnings.sessions, 0),
      totalPiasters: teachers.reduce((total, t) => total + t.earnings.amountPiasters, 0),
      teacherOptions: await listPayrollTeachers(auth.data, tx),
      branchOptions: auth.data.role === "super_admin" ? await listPayrollBranches(auth.data, tx) : [],
      canChooseBranch: auth.data.role === "super_admin",
    });
  });
}

export type PayrollDrillDown = {
  teacherName: string;
  from: string;
  to: string;
  sessions: PayrollSessionRow[];
  truncated: boolean;
};

const DRILL_DOWN_LIMIT = 500;

export async function getPayrollSessions(input: {
  teacherId: string;
  from: string;
  to: string;
  branchId?: string | undefined;
}): Promise<Result<PayrollDrillDown>> {
  const auth = await requirePermission("payroll.read");
  if (!auth.ok) return auth;

  const branchId = auth.data.role === "super_admin" ? input.branchId : undefined;

  return withTenant(auth.data, async (tx) => {
    const sessions = await listPaidSessions(
      auth.data,
      tx,
      { from: input.from, to: input.to, teacherId: input.teacherId, branchId },
      DRILL_DOWN_LIMIT + 1,
    );

    const teacher = (await listPayrollTeachers(auth.data, tx)).find((row) => row.id === input.teacherId);
    if (!teacher) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    return ok({
      teacherName: teacher.fullName,
      from: input.from,
      to: input.to,
      sessions: sessions.slice(0, DRILL_DOWN_LIMIT),
      truncated: sessions.length > DRILL_DOWN_LIMIT,
    });
  });
}

/** Reshapes the SQL groups into the domain's `Earnings` structure, per teacher. */
function groupByTeacher(groups: readonly EarningsGroup[]): TeacherEarnings[] {
  const byTeacher = new Map<string, TeacherEarnings>();

  for (const group of groups) {
    const teacher = byTeacher.get(group.teacherId) ?? {
      teacherId: group.teacherId,
      teacherName: group.teacherName,
      earnings: { branches: [], sessions: 0, amountPiasters: 0 },
      branchNames: {},
    };

    const branch =
      teacher.earnings.branches.find((item) => item.branchId === group.branchId) ??
      emptyBranch(group.branchId);
    if (!teacher.earnings.branches.includes(branch)) teacher.earnings.branches.push(branch);

    branch[group.track] = { sessions: group.sessions, amountPiasters: group.amountPiasters };
    branch.sessions += group.sessions;
    branch.amountPiasters += group.amountPiasters;

    teacher.earnings.sessions += group.sessions;
    teacher.earnings.amountPiasters += group.amountPiasters;
    if (group.branchName) teacher.branchNames[group.branchId] = group.branchName;

    byTeacher.set(group.teacherId, teacher);
  }

  return [...byTeacher.values()];
}

function emptyBranch(branchId: string): BranchEarnings {
  return {
    branchId,
    scientific: { sessions: 0, amountPiasters: 0 },
    literary: { sessions: 0, amountPiasters: 0 },
    sessions: 0,
    amountPiasters: 0,
  };
}

/** The first of the month a date falls in — the default payroll period. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}
