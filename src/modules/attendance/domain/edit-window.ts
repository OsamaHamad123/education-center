/**
 * Who may write attendance, for which day (PROJECT_PLAN 10.5, section 8).
 *
 * Three different limits meet here and they are easy to confuse, so they are one
 * function with one answer:
 *
 *   super_admin  — any past day, no window. They are the escalation path.
 *   branch_admin — today, or up to `attendance_edit_window_days` back. The window
 *                  exists so a register cannot be quietly rewritten weeks later.
 *   teacher      — today only, and only while the centre allows teacher marking.
 *
 * The database enforces the teacher half of this in `class_sessions_insert`; this
 * function exists so the refusal arrives as an Arabic sentence instead of a
 * zero-rows result the UI would have to guess at.
 */

export type MarkingRole = "super_admin" | "branch_admin" | "teacher";

export type MarkingViolation =
  "FUTURE_DATE" | "OUTSIDE_EDIT_WINDOW" | "TEACHER_TODAY_ONLY" | "TEACHER_MARKING_DISABLED";

export type MarkingRequest = {
  role: MarkingRole;
  /** `yyyy-MM-dd`, both of them in Cairo. */
  sessionDate: string;
  today: string;
  /** `center_settings.attendance_edit_window_days`. */
  editWindowDays: number;
  /** `center_settings.teacher_can_mark_attendance`. */
  teacherMarkingEnabled: boolean;
};

export function canMarkAttendance(request: MarkingRequest): MarkingViolation | null {
  // A register for a day that has not happened is not a late edit, it is fiction.
  // The plan does not spell this out; see the decision recorded in docs/PROGRESS.md.
  if (request.sessionDate > request.today) return "FUTURE_DATE";

  if (request.role === "teacher") {
    if (!request.teacherMarkingEnabled) return "TEACHER_MARKING_DISABLED";
    return request.sessionDate === request.today ? null : "TEACHER_TODAY_ONLY";
  }

  if (request.role === "super_admin") return null;

  return withinDays(request.sessionDate, request.today, request.editWindowDays)
    ? null
    : "OUTSIDE_EDIT_WINDOW";
}

/** Whole days between two `yyyy-MM-dd` strings, both read as Cairo calendar days. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function withinDays(sessionDate: string, today: string, windowDays: number): boolean {
  return daysBetween(sessionDate, today) <= windowDays;
}
