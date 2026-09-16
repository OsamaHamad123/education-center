/**
 * The arithmetic of a fee (P5).
 *
 * Pure: no database, no framework. Everything the product says about money — what is
 * due, what is outstanding, whether a month is settled — is decided here and nowhere
 * else, so there is exactly one definition of "paid" and it is tested without fixtures.
 *
 * "Paid" is deliberately NOT stored. A status column is a second source of truth, and
 * it drifts from the first the day somebody inserts a payment by hand.
 */

export type InvoiceMoney = {
  amountPiasters: number;
  discountPiasters: number;
  /** The SUM of every payment row, reversals included — so reversals are negative. */
  paidPiasters: number;
};

/** What is actually owed after the discount. Never negative. */
export function netDue(invoice: InvoiceMoney): number {
  return Math.max(invoice.amountPiasters - invoice.discountPiasters, 0);
}

/** What is left to collect. Negative means the family has paid more than it owes. */
export function balanceOf(invoice: InvoiceMoney): number {
  return netDue(invoice) - invoice.paidPiasters;
}

export type InvoiceState = "paid" | "partial" | "unpaid" | "overpaid" | "waived";

/**
 * The one place the words are decided.
 *
 * `waived` rather than a "cancelled" status: an invoice raised in error is discounted
 * in full with a reason (drizzle/0013, decision 5), and that is worth SAYING on the
 * screen rather than showing as a mysterious zero that looks like a paid month.
 */
export function invoiceState(invoice: InvoiceMoney): InvoiceState {
  const due = netDue(invoice);
  if (due === 0 && invoice.discountPiasters > 0) return "waived";
  if (invoice.paidPiasters > due) return "overpaid";
  if (invoice.paidPiasters >= due && due > 0) return "paid";
  if (invoice.paidPiasters > 0) return "partial";
  return "unpaid";
}

export type LedgerTotals = {
  billed: number;
  discounted: number;
  collected: number;
  outstanding: number;
};

/** The foot of the collection screen: what the month is worth and what is missing. */
export function totalsOf(invoices: readonly InvoiceMoney[]): LedgerTotals {
  return invoices.reduce<LedgerTotals>(
    (totals, invoice) => ({
      billed: totals.billed + invoice.amountPiasters,
      discounted: totals.discounted + invoice.discountPiasters,
      collected: totals.collected + invoice.paidPiasters,
      // Outstanding is summed per invoice rather than computed from the totals: an
      // overpaid family must not quietly cover somebody else's arrears in the figure
      // the office chases.
      outstanding: totals.outstanding + Math.max(balanceOf(invoice), 0),
    }),
    { billed: 0, discounted: 0, collected: 0, outstanding: 0 },
  );
}

/**
 * Why a payment may be refused, or null when it may be taken.
 *
 * Overpayment is refused rather than merely flagged: at a cash desk it is nearly always
 * a typo — 5000 for 500 — and a ledger that accepts it makes somebody chase a refund
 * that never should have existed.
 */
export type PaymentProblem = "NOT_POSITIVE" | "EXCEEDS_BALANCE" | "NOTHING_DUE";

export function checkPayment(invoice: InvoiceMoney, amountPiasters: number): PaymentProblem | null {
  if (!Number.isInteger(amountPiasters) || amountPiasters <= 0) return "NOT_POSITIVE";
  const balance = balanceOf(invoice);
  if (balance <= 0) return "NOTHING_DUE";
  if (amountPiasters > balance) return "EXCEEDS_BALANCE";
  return null;
}

// --- periods ------------------------------------------------------------------

/** `2026-09-16` → `2026-09`. The billing period a date falls in. */
export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** The first day of a period, which is what a fee plan's date is compared against. */
export function periodStart(period: string): string {
  return `${period}-01`;
}

export function isValidPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The period before this one, for "last month" links. Handles the January edge. */
export function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/**
 * The price in force for a period: the latest plan effective on or before its first day.
 *
 * Plans are versioned rather than edited, so billing September next year still bills it
 * at September's price — which is the entire reason the table has a date at all.
 */
export function planForPeriod<T extends { effectiveFrom: string; amountPiasters: number }>(
  plans: readonly T[],
  period: string,
): T | null {
  const start = periodStart(period);
  const applicable = plans
    .filter((plan) => plan.effectiveFrom <= start)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return applicable[0] ?? null;
}
