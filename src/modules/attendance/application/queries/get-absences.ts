import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { err, ok, type Result } from "@/shared/lib/result";
import { ar } from "@/shared/i18n/ar";
import { todayInCairo } from "@/shared/lib/time";
import { readDateRange, uuidParam } from "@/shared/lib/url-filters";
import { groupAbsences, type StudentAbsences } from "../../domain/absences";
import { listClassOptions, listUnexcusedAbsences } from "../../infrastructure/attendance.repository";

/**
 * Absences without permission — the screen the centre asked for on 2026-09-24:
 * "a student who misses a period without permission, even one, shows his name and the
 * lesson he missed".
 *
 * `attendance.read`, which all three roles hold, and NO role branch in the code. A
 * teacher reading this gets their own lessons and a branch admin gets the branch,
 * because `attendance_records_select` says so — the isolation is the database's, and
 * the two screens are the same query.
 *
 * It is deliberately NOT the alerts screen. That one needs a percentage and a minimum
 * number of lessons before a name appears, which is right for "who is at risk" and
 * wrong for "who was not in third period yesterday".
 */

const MAX_ROWS = 2000;

export type AbsencesView = {
  from: string;
  to: string;
  classId: string | null;
  classes: { id: string; name: string }[];
  students: StudentAbsences[];
  /** Total periods missed, which is not the number of students. */
  totalPeriods: number;
  /** True when the query hit its ceiling and the range needs narrowing. */
  truncated: boolean;
};

export async function getUnexcusedAbsences(input: {
  from?: string | undefined;
  to?: string | undefined;
  classId?: string | undefined;
}): Promise<Result<AbsencesView>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;

  const today = todayInCairo();
  const parsed = readDateRange(input);
  // This month so far, like every other report. A malformed date is an absent one.
  const from = parsed.from ?? `${today.slice(0, 7)}-01`;
  const to = parsed.to ?? today;
  const classId = uuidParam.parse(input.classId);

  return withTenant(auth.data, async (tx) => {
    const rows = await listUnexcusedAbsences(auth.data, tx, { from, to, classId }, MAX_ROWS);
    // A teacher has no `class.read` and no one branch, so the filter is offered only
    // to an admin who has a branch selected.
    const classes =
      auth.data.role === "teacher" || !auth.data.branchId
        ? []
        : await listClassOptions(auth.data, tx, auth.data.branchId);

    return ok({
      from,
      to,
      classId: classId ?? null,
      classes,
      students: groupAbsences(rows),
      totalPeriods: rows.length,
      truncated: rows.length === MAX_ROWS,
    });
  });
}

/**
 * Today's, for the dashboards — the same query with the range collapsed to one day.
 *
 * Separate rather than a flag, because the two have different failure modes: this one
 * is read on every dashboard load and must stay small, and the one above is a report
 * somebody asked for.
 */
export async function getTodayAbsences(): Promise<Result<StudentAbsences[]>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;

  const today = todayInCairo();

  return withTenant(auth.data, async (tx) => {
    const rows = await listUnexcusedAbsences(auth.data, tx, { from: today, to: today }, 500);
    return ok(groupAbsences(rows));
  });
}

/** Guard for a page that needs a branch chosen before it can mean anything. */
export function requireBranchFor(branchId: string | null): Result<string> {
  return branchId ? ok(branchId) : err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);
}
