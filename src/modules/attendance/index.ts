/**
 * Public API of the `attendance` module — الحضور والحصص.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/attendance/domain|application|infrastructure|ui` from outside this module.
 */
export { summarize, type AttendanceStatus, type AttendanceSummary } from "./domain/roster";
export { canMarkAttendance, type MarkingViolation } from "./domain/edit-window";
export {
  getAttendanceBoard,
  getAttendanceSheet,
  listAttendanceClasses,
  type AttendanceBoard,
  type AttendanceSheet,
  type BoardPeriod,
} from "./application/queries/get-attendance-board";
export {
  getMyToday,
  resolveSlotForMarking,
  type TeacherToday,
  type TodayPeriod,
} from "./application/queries/get-my-today";
export {
  getSessionForPrint,
  getSessionLog,
  type SessionLog,
  type SessionLogRow,
} from "./application/queries/list-sessions";
export { saveAttendance, type SaveAttendanceResult } from "./application/use-cases/save-attendance";
export {
  cancelSession,
  createExtraSession,
  restoreSession,
  setSubstituteTeacher,
} from "./application/use-cases/manage-session";
/**
 * Two repository functions, deliberately on the public face of the module.
 *
 * `getSessionForPrint` above is the application's door and needs a session, which an
 * integration test does not have — it runs against the database as the app role. These
 * are what `tests/integration/tenant-isolation/attendance.test.ts` asserts on: that a
 * by-id lookup is not subject to the log's cap (docs/AUDIT-2026-09.md, finding 14), and
 * that RLS still refuses a session in another branch. The alternative was a deep import,
 * and CLAUDE.md rule 3 says no — so the module says what it is willing to expose.
 */
export { findSessionById, listSessions, type SessionRow } from "./infrastructure/attendance.repository";

export { AttendanceBoardView } from "./ui/attendance-board";
export { TeacherTodayView } from "./ui/teacher-today";
export { AttendanceSheetView } from "./ui/attendance-sheet";
export { AttendanceSheetPrint } from "./ui/attendance-print";
export { SessionsTable } from "./ui/sessions-table";
export { SessionsFilters } from "./ui/sessions-filters";
export { ExtraSessionDialog } from "./ui/extra-session-dialog";
