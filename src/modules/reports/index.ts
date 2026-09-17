/**
 * Public API of the `reports` module — التقارير.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/reports/domain|application|infrastructure|ui` from outside this module.
 */
export {
  absenceAlerts,
  absenceRate,
  attendanceRate,
  addCounts,
  countsFrom,
  totalOf,
  ZERO_COUNTS,
  type StatusCounts,
} from "./domain/attendance-rates";
export {
  getAbsenceAlerts,
  getBranchComparison,
  getBranchDashboard,
  getClassMatrixReport,
  getStudentAttendanceReport,
  type AbsenceAlertsReport,
  type BranchComparison,
  type BranchDashboard,
  type ClassMatrixReport,
  type StudentAttendanceReport,
  type StudentReportRow,
} from "./application/queries/get-reports";
export { getContactList, type ContactList, type ContactRow } from "./application/queries/get-contact-list";
export { recordParentContact } from "./application/use-cases/record-contact";
export { setFamilyMessaging } from "./application/use-cases/set-messaging";
export { getMoneyReport, type MoneyReport } from "./application/queries/get-money";
export { AbsenceAlertsList } from "./ui/absence-alerts";
export { ContactListView } from "./ui/contact-list";
export { ContactDate } from "./ui/contact-date";
export { BranchComparisonView } from "./ui/branch-comparison";
export { MoneyReportView } from "./ui/money-report";
export { BranchDashboardView } from "./ui/branch-dashboard";
export { ClassMatrix } from "./ui/class-matrix";
export { ReportFilters } from "./ui/report-filters";
export { StudentAttendanceTable } from "./ui/student-attendance-table";
export { StudentAttendancePrint } from "./ui/student-attendance-print";
