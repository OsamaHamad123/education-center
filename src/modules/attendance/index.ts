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
export { getSessionLog, type SessionLog, type SessionLogRow } from "./application/queries/list-sessions";
export { saveAttendance, type SaveAttendanceResult } from "./application/use-cases/save-attendance";
export {
  cancelSession,
  createExtraSession,
  restoreSession,
  setSubstituteTeacher,
} from "./application/use-cases/manage-session";
export { AttendanceBoardView } from "./ui/attendance-board";
export { TeacherTodayView } from "./ui/teacher-today";
export { AttendanceSheetView } from "./ui/attendance-sheet";
export { AttendanceSheetPrint } from "./ui/attendance-print";
export { SessionsTable } from "./ui/sessions-table";
export { SessionsFilters } from "./ui/sessions-filters";
export { ExtraSessionDialog } from "./ui/extra-session-dialog";
