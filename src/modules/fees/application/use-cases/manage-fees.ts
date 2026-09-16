"use server";

import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { checkPayment, periodStart, planForPeriod } from "../../domain/ledger";
import {
  findInvoice,
  findReceipt,
  insertFeePlan,
  insertInvoices,
  insertPayment,
  listBillableStudents,
  listPlansForClasses,
  nextReceiptNo,
  updateInvoiceDiscount,
} from "../../infrastructure/fees.repository";
import {
  generateInvoicesSchema,
  recordPaymentSchema,
  reversePaymentSchema,
  setDiscountSchema,
  setFeePlanSchema,
} from "../schemas";

/**
 * Everything that changes money (P5).
 *
 * All five go through `createAction`, so every one of them is authorised, validated,
 * branch-scoped, transactional and audited. For a ledger that is not a nicety: "who
 * took this money and when" has to be answerable from the product, not from memory.
 *
 * Nothing here edits or deletes a payment, because nothing CAN — `school_app` holds
 * only SELECT and INSERT on that table (drizzle/0013). A mistake is a reversal.
 */

const PATHS = { paths: ["/fees"] };

/**
 * Sets a class's price from a given month.
 *
 * A new row, never an edit: a price rise must not restate the months already billed at
 * the old price. Super admin only, the same way teacher rates are — the price list is
 * the owner's, the cash desk is the branch's.
 */
export const setFeePlan = createAction({
  permission: "fee.plan",
  schema: setFeePlanSchema,
  audit: { action: "create", entity: "fee_plan", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: ["/fees", "/fees/plans"] },
  handler: async ({ tx, ctx, input }) => {
    if (!ctx.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const row = await insertFeePlan(ctx, tx, {
      branchId: ctx.branchId,
      classId: input.classId,
      amountPiasters: input.amountPounds,
      effectiveFrom: periodStart(input.effectiveFrom),
    });
    return ok(row);
  },
});

/**
 * Bills a month.
 *
 * Idempotent by the unique index on `(student_id, period)`, not by checking first: two
 * people pressing the button at once must not double-bill anybody, and a check-then-act
 * is exactly the race that would.
 *
 * A class with no price in force for that month is SKIPPED rather than billed at zero —
 * a zero invoice looks like a settled month, and this is the mistake that is expensive
 * to notice.
 */
export const generateInvoices = createAction({
  permission: "fee.collect",
  schema: generateInvoicesSchema,
  audit: { action: "create", entity: "invoice.batch", entityId: (out: { period: string }) => out.period },
  revalidate: PATHS,
  handler: async ({ tx, ctx, input }) => {
    if (!ctx.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const [students, plans] = await Promise.all([
      listBillableStudents(ctx, tx, input.classId),
      listPlansForClasses(ctx, tx),
    ]);

    const rows = [];
    let unpriced = 0;
    for (const student of students) {
      const plan = planForPeriod(plans.get(student.classId) ?? [], input.period);
      if (!plan) {
        unpriced += 1;
        continue;
      }
      rows.push({
        branchId: student.branchId,
        studentId: student.studentId,
        classId: student.classId,
        period: input.period,
        amountPiasters: plan.amountPiasters,
      });
    }

    const created = await insertInvoices(ctx, tx, rows);
    return ok({ period: input.period, created, skipped: rows.length - created, unpriced });
  },
});

/**
 * Takes money.
 *
 * The amount is checked against the invoice's live balance INSIDE the transaction, so
 * two receipts written at the same desk at the same moment cannot between them collect
 * more than is owed.
 */
export const recordPayment = createAction({
  permission: "fee.collect",
  schema: recordPaymentSchema,
  audit: { action: "create", entity: "payment", entityId: (out: { id: string }) => out.id },
  revalidate: PATHS,
  handler: async ({ tx, ctx, input }) => {
    if (!ctx.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const invoice = await findInvoice(ctx, tx, input.invoiceId);
    // A foreign invoice is invisible under RLS, so this is a 404 and not a 403 — an id
    // must never confirm that it exists somewhere else (CLAUDE.md, isolation).
    if (!invoice) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const problem = checkPayment(invoice, input.amountPounds);
    if (problem === "NOT_POSITIVE") return err("VALIDATION_ERROR", ar.fees.amountInvalid);
    if (problem === "NOTHING_DUE") return err("CONFLICT", ar.fees.nothingDue);
    if (problem === "EXCEEDS_BALANCE") return err("CONFLICT", ar.fees.exceedsBalance);

    const year = Number(todayInCairo().slice(0, 4));
    const receiptNo = await nextReceiptNo(ctx, tx, ctx.branchId, year);

    const row = await insertPayment(ctx, tx, {
      branchId: ctx.branchId,
      invoiceId: input.invoiceId,
      amountPiasters: input.amountPounds,
      method: input.method,
      receiptYear: year,
      receiptNo,
      note: input.note ?? null,
    });
    return ok(row);
  },
});

/**
 * Gives money back, as a row rather than an erasure.
 *
 * The reversal takes its own receipt number, because the family is handed a piece of
 * paper for it too. The unique index on `reverses_id` is what stops the same receipt
 * being reversed twice — checking first would be a race.
 */
export const reversePayment = createAction({
  permission: "fee.collect",
  schema: reversePaymentSchema,
  audit: { action: "delete", entity: "payment.reversal", entityId: (out: { id: string }) => out.id },
  revalidate: PATHS,
  handler: async ({ tx, ctx, input }) => {
    if (!ctx.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const original = await findReceipt(ctx, tx, input.paymentId);
    if (!original) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (original.amountPiasters < 0) return err("CONFLICT", ar.fees.alreadyReversal);

    const year = Number(todayInCairo().slice(0, 4));
    const receiptNo = await nextReceiptNo(ctx, tx, ctx.branchId, year);

    const row = await insertPayment(ctx, tx, {
      branchId: ctx.branchId,
      invoiceId: original.invoiceId,
      amountPiasters: -original.amountPiasters,
      method: original.method,
      receiptYear: year,
      receiptNo,
      note: input.reason,
      reversesId: input.paymentId,
    });
    return ok(row);
  },
});

/** Discounts an invoice, with the reason the database also insists on. */
export const setDiscount = createAction({
  permission: "fee.collect",
  schema: setDiscountSchema,
  audit: { action: "update", entity: "invoice.discount", entityId: (out: { id: string }) => out.id },
  revalidate: PATHS,
  handler: async ({ tx, ctx, input }) => {
    const invoice = await findInvoice(ctx, tx, input.invoiceId);
    if (!invoice) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    if (input.discountPounds > invoice.amountPiasters) {
      return err("VALIDATION_ERROR", ar.fees.discountTooLarge, {
        discountPounds: [ar.fees.discountTooLarge],
      });
    }
    if (input.discountPounds > 0 && !input.reason) {
      return err("VALIDATION_ERROR", ar.fees.reasonRequired, { reason: [ar.fees.reasonRequired] });
    }
    // A discount that would take the invoice below what has already been collected
    // would leave the family in credit for money the centre kept. Refuse it, and say so.
    if (invoice.amountPiasters - input.discountPounds < invoice.paidPiasters) {
      return err("CONFLICT", ar.fees.discountBelowPaid);
    }

    await updateInvoiceDiscount(
      ctx,
      tx,
      input.invoiceId,
      input.discountPounds,
      input.discountPounds > 0 ? (input.reason ?? null) : null,
    );
    return ok({ id: input.invoiceId });
  },
});
