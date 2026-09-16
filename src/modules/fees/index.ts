/**
 * Public API of the `fees` module — الرسوم والتحصيل.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/fees/domain|application|infrastructure|ui`.
 */
export {
  balanceOf,
  invoiceState,
  netDue,
  periodOf,
  totalsOf,
  type InvoiceState,
  type LedgerTotals,
} from "./domain/ledger";
export {
  getFeePlans,
  getFeesBoard,
  getReceipt,
  getStudentStatement,
  type FeePlansView,
  type FeeRow,
  type FeesBoard,
  type Statement,
} from "./application/queries/get-fees";
export {
  generateInvoices,
  recordPayment,
  reversePayment,
  setDiscount,
  setFeePlan,
} from "./application/use-cases/manage-fees";
export { FeesBoardView } from "./ui/fees-board";
export { FeePlansView as FeePlansScreen } from "./ui/fee-plans";
export { StatementView } from "./ui/statement";
export { ReceiptPrint } from "./ui/receipt-print";
