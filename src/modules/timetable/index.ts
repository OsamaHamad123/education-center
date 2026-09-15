/**
 * Public API of the `timetable` module — جدول الحصص الأسبوعي.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/timetable/domain|application|infrastructure|ui` from outside this module.
 */
export { computePeriods, dayEndTime, type ComputedPeriod } from "./domain/compute-periods";
export {
  getClassTimetable,
  listCopySources,
  listTimetableClasses,
  type ClassPickerOption,
  type ClassTimetable,
  type GridCell,
} from "./application/queries/get-class-timetable";
export {
  getMyTimetable,
  getTeacherTimetable,
  type TeacherSlot,
  type TeacherTimetable,
} from "./application/queries/get-teacher-timetable";
export { getScheduleSettings, type TrackSchedule } from "./application/queries/get-schedule-settings";
export { clearSlot, copyTimetable, setSlot, type CopyResult } from "./application/use-cases/manage-slot";
export {
  saveScheduleSettings,
  type ScheduleSaveReport,
} from "./application/use-cases/manage-schedule-settings";
export { TimetableGrid } from "./ui/timetable-grid";
export { ScheduleSettingsForm } from "./ui/schedule-settings-form";
export { TeacherTimetableView } from "./ui/teacher-timetable-view";
export { ClassTimetablePrint, TeacherTimetablePrint } from "./ui/class-timetable-print";
