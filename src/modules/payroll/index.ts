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
export {
  canEditSettledPeriod,
  isSettled,
  paidTotal,
  settlementState,
  type SettlementState,
} from "./domain/settlement";
export {
  getMyPayouts,
  getSettlements,
  /**
   * Called by the ATTENDANCE module inside its own transaction: a month whose money
   * has been handed over stops being quietly rewritable (drizzle/0016).
   */
  isPeriodSettled,
  type SettlementRow,
  type SettlementsView,
} from "./application/queries/get-settlements";
export { reversePayrollRun, settlePayroll } from "./application/use-cases/settle-payroll";
export { exportPayrollCsv } from "./application/use-cases/export-payroll";
export { PayrollReportView, PayrollSessionsView } from "./ui/payroll-report";
export { PayrollPrint } from "./ui/payroll-print";
export { SettlementsScreen } from "./ui/settlements";
export { TeacherPayouts } from "./ui/teacher-payouts";
