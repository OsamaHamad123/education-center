/**
 * Public API of the `payroll` module — مستحقات المعلمين.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/payroll/domain|application|infrastructure|ui` from outside this module.
 */
export {
  calculateEarnings,
  grandTotal,
  type BranchEarnings,
  type Earnings,
  type PayrollSession,
} from "./domain/calculate-earnings";
export {
  getPayrollReport,
  getPayrollSessions,
  startOfMonth,
  type PayrollDrillDown,
  type PayrollReport,
  type TeacherEarnings,
} from "./application/queries/get-payroll";
export { reconcileEarnings, type EarningsReconciliation } from "./application/queries/reconcile-earnings";
export type { EarningsGroup, PayrollFilters } from "./infrastructure/payroll.repository";
export { exportPayrollCsv } from "./application/use-cases/export-payroll";
export { PayrollReportView, PayrollSessionsView } from "./ui/payroll-report";
export { PayrollPrint } from "./ui/payroll-print";
