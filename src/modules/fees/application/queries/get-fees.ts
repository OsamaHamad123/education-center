import { eq } from "drizzle-orm";
import { requirePermission } from "@/shared/actions/create-action";
import { students } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { listClassOptions } from "@/modules/classes";
import {
  balanceOf,
  invoiceState,
  isValidPeriod,
  netDue,
  periodOf,
  totalsOf,
  type InvoiceState,
  type LedgerTotals,
} from "../../domain/ledger";
import {
  findReceipt,
  listFeePlans,
  listInvoicesForPeriod,
  listInvoicesForStudent,
  listPaymentsForInvoices,
  type FeePlanRow,
  type PaymentRow,
} from "../../infrastructure/fees.repository";

/**
 * Reading the ledger (P5).
 *
 * Every figure on every screen comes from `domain/ledger.ts`, so "paid" means the same
 * thing on the collection board, on a statement, and in the parent's portal. Nothing is
 * stored as a status and nothing is computed twice.
 */

export type FeeRow = {
  invoiceId: string | null;
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  amountPiasters: number;
  discountPiasters: number;
  discountReason: string | null;
  paidPiasters: number;
  duePiasters: number;
  balancePiasters: number;
  state: InvoiceState | "unbilled";
};

export type FeesBoard = {
  period: string;
  classId: string | null;
  classes: { id: string; name: string }[];
  rows: FeeRow[];
  totals: LedgerTotals;
  /** Students in scope with no invoice for this month — the office's first question. */
  unbilled: number;
};

export async function getFeesBoard(input: {
  period?: string | undefined;
  classId?: string | undefined;
}): Promise<Result<FeesBoard>> {
  const auth = await requirePermission("fee.read");
  if (!auth.ok) return auth;
  // Collecting is a branch's desk. "كافة الفروع" has no till.
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const period = isValidPeriod(input.period) ? input.period : periodOf(todayInCairo());

  const classList = await listClassOptions();
  const classes = classList.ok ? classList.data.map((c) => ({ id: c.id, name: c.name })) : [];
  // A class id from another branch is nothing to explain — show the whole branch.
  const classId = classes.some((c) => c.id === input.classId) ? (input.classId as string) : null;

  return withTenant(auth.data, async (tx) => {
    const rows = await listInvoicesForPeriod(auth.data, tx, period, classId ?? undefined);

    const shaped = rows.map((row) => {
      const money = {
        amountPiasters: row.amountPiasters,
        discountPiasters: row.discountPiasters,
        paidPiasters: row.paidPiasters,
      };
      return {
        ...row,
        duePiasters: netDue(money),
        balancePiasters: balanceOf(money),
        // "Unbilled" is not a ledger state — there is no invoice — but it is the row
        // the office most needs to see, so it is named rather than shown as a zero.
        state: row.invoiceId ? invoiceState(money) : ("unbilled" as const),
      } satisfies FeeRow;
    });

    return ok({
      period,
      classId,
      classes,
      rows: shaped,
      totals: totalsOf(shaped.filter((row) => row.invoiceId !== null)),
      unbilled: shaped.filter((row) => row.invoiceId === null).length,
    });
  });
}

// --- one student --------------------------------------------------------------

export type StatementRow = {
  invoiceId: string;
  period: string;
  className: string;
  amountPiasters: number;
  discountPiasters: number;
  discountReason: string | null;
  paidPiasters: number;
  balancePiasters: number;
  state: InvoiceState;
  payments: PaymentRow[];
};

export type Statement = {
  studentId: string;
  fullName: string;
  studentCode: string;
  rows: StatementRow[];
  totals: LedgerTotals;
};

export async function getStudentStatement(studentId: string): Promise<Result<Statement>> {
  const auth = await requirePermission("fee.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const invoices = await listInvoicesForStudent(auth.data, tx, studentId);
    const paymentsByInvoice = await listPaymentsForInvoices(
      auth.data,
      tx,
      invoices.map((invoice) => invoice.id),
    );

    // Read through RLS like everything else: a student in another branch simply is not
    // there, so a foreign id is a 404 rather than an explanation.
    const [head] = await tx
      .select({ fullName: students.fullName, studentCode: students.studentCode })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!head) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const rows = invoices.map((invoice) => {
      const money = {
        amountPiasters: invoice.amountPiasters,
        discountPiasters: invoice.discountPiasters,
        paidPiasters: invoice.paidPiasters,
      };
      return {
        invoiceId: invoice.id,
        period: invoice.period,
        className: invoice.className,
        ...money,
        discountReason: invoice.discountReason,
        balancePiasters: balanceOf(money),
        state: invoiceState(money),
        payments: paymentsByInvoice.get(invoice.id) ?? [],
      } satisfies StatementRow;
    });

    return ok({
      studentId,
      fullName: head.fullName,
      studentCode: head.studentCode,
      rows,
      totals: totalsOf(rows),
    });
  });
}

// --- the price list -----------------------------------------------------------

export type FeePlansView = { plans: FeePlanRow[]; classes: { id: string; name: string }[] };

export async function getFeePlans(): Promise<Result<FeePlansView>> {
  const auth = await requirePermission("fee.read");
  if (!auth.ok) return auth;

  const classList = await listClassOptions();
  const classes = classList.ok ? classList.data.map((c) => ({ id: c.id, name: c.name })) : [];

  return withTenant(auth.data, async (tx) => ok({ plans: await listFeePlans(auth.data, tx), classes }));
}

// --- one receipt --------------------------------------------------------------

export async function getReceipt(paymentId: string) {
  const auth = await requirePermission("fee.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const receipt = await findReceipt(auth.data, tx, paymentId);
    if (!receipt) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(receipt);
  });
}
