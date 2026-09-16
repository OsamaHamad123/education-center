import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  classes,
  feePlans,
  invoices,
  payments,
  receiptCounters,
  students,
  user,
  type PaymentMethod,
} from "@/shared/db/schema";

/**
 * The fee ledger's data access (P5).
 *
 * Every function takes a `TenantContext` and runs inside `withTenant`, so the branch
 * scoping is RLS's and not a filter anybody could forget. Nothing here decides whether
 * money is owed — that arithmetic is in `domain/ledger.ts`, and this file only fetches
 * the three numbers it needs.
 */

export type FeePlanRow = {
  id: string;
  classId: string;
  className: string;
  amountPiasters: number;
  effectiveFrom: string;
};

export async function listFeePlans(_ctx: TenantContext, tx: Tx): Promise<FeePlanRow[]> {
  return tx
    .select({
      id: feePlans.id,
      classId: feePlans.classId,
      className: classes.name,
      amountPiasters: feePlans.amountPiasters,
      effectiveFrom: feePlans.effectiveFrom,
    })
    .from(feePlans)
    .innerJoin(classes, eq(classes.id, feePlans.classId))
    .orderBy(asc(classes.name), desc(feePlans.effectiveFrom));
}

export async function insertFeePlan(
  ctx: TenantContext,
  tx: Tx,
  values: { branchId: string; classId: string; amountPiasters: number; effectiveFrom: string },
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(feePlans)
    .values({ ...values, createdBy: ctx.userId })
    .returning({ id: feePlans.id });
  if (!row) throw new Error("insertFeePlan returned no row");
  return row;
}

// --- invoices -----------------------------------------------------------------

export type InvoiceRow = {
  invoiceId: string | null;
  studentId: string;
  studentCode: string;
  fullName: string;
  classId: string;
  className: string;
  amountPiasters: number;
  discountPiasters: number;
  discountReason: string | null;
  paidPiasters: number;
};

/**
 * Every ACTIVE student in scope for a period, with their invoice if one exists.
 *
 * A left join rather than a list of invoices, deliberately: the office's question is
 * "who has not paid", and a student nobody has billed yet is the most important row on
 * that screen — an inner join would hide exactly the person who needs chasing.
 */
export async function listInvoicesForPeriod(
  _ctx: TenantContext,
  tx: Tx,
  period: string,
  classId?: string,
): Promise<InvoiceRow[]> {
  const paid = tx.$with("paid").as(
    tx
      .select({
        invoiceId: payments.invoiceId,
        total: sql<number>`sum(${payments.amountPiasters})::int`.as("total"),
      })
      .from(payments)
      .groupBy(payments.invoiceId),
  );

  const where = [eq(students.status, "active")];
  if (classId) where.push(eq(students.classId, classId));

  const rows = await tx
    .with(paid)
    .select({
      invoiceId: invoices.id,
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      classId: classes.id,
      className: classes.name,
      amountPiasters: invoices.amountPiasters,
      discountPiasters: invoices.discountPiasters,
      discountReason: invoices.discountReason,
      paidTotal: paid.total,
    })
    .from(students)
    .innerJoin(classes, eq(classes.id, students.classId))
    .leftJoin(invoices, and(eq(invoices.studentId, students.id), eq(invoices.period, period)))
    .leftJoin(paid, eq(paid.invoiceId, invoices.id))
    .where(and(...where))
    .orderBy(asc(classes.name), asc(students.fullName));

  return rows.map((row) => ({
    invoiceId: row.invoiceId,
    studentId: row.studentId,
    studentCode: row.studentCode,
    fullName: row.fullName,
    classId: row.classId,
    className: row.className,
    amountPiasters: row.amountPiasters ?? 0,
    discountPiasters: row.discountPiasters ?? 0,
    discountReason: row.discountReason,
    paidPiasters: row.paidTotal ?? 0,
  }));
}

/** One invoice with its money, or null. Used before every write that touches it. */
export async function findInvoice(
  _ctx: TenantContext,
  tx: Tx,
  invoiceId: string,
): Promise<{
  id: string;
  branchId: string;
  studentId: string;
  amountPiasters: number;
  discountPiasters: number;
  paidPiasters: number;
} | null> {
  const [row] = await tx
    .select({
      id: invoices.id,
      branchId: invoices.branchId,
      studentId: invoices.studentId,
      amountPiasters: invoices.amountPiasters,
      discountPiasters: invoices.discountPiasters,
      paidPiasters: sql<number>`coalesce((
        select sum(p.amount_piasters) from payments p where p.invoice_id = ${invoices.id}
      ), 0)::int`,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  return row ?? null;
}

/**
 * Bills a month. Returns how many invoices were actually created.
 *
 * `onConflictDoNothing` on `(student_id, period)` is what makes this idempotent — the
 * office will run it twice, and the second run must bill nobody again.
 */
export async function insertInvoices(
  ctx: TenantContext,
  tx: Tx,
  rows: { branchId: string; studentId: string; classId: string; period: string; amountPiasters: number }[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const inserted = await tx
    .insert(invoices)
    .values(rows.map((row) => ({ ...row, createdBy: ctx.userId })))
    .onConflictDoNothing({ target: [invoices.studentId, invoices.period] })
    .returning({ id: invoices.id });

  return inserted.length;
}

export async function updateInvoiceDiscount(
  _ctx: TenantContext,
  tx: Tx,
  invoiceId: string,
  discountPiasters: number,
  reason: string | null,
): Promise<void> {
  await tx
    .update(invoices)
    .set({ discountPiasters, discountReason: reason })
    .where(eq(invoices.id, invoiceId));
}

// --- payments -----------------------------------------------------------------

/**
 * Reserves the next receipt number for a branch and year.
 *
 * `FOR UPDATE` is the whole point, exactly as in `nextStudentSequence`: two people at
 * the desk at the same moment must not be handed the same receipt number. The lock is
 * held until the surrounding transaction commits, which is when the payment appears.
 */
export async function nextReceiptNo(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  year: number,
): Promise<number> {
  await tx.insert(receiptCounters).values({ branchId, year, lastValue: 0 }).onConflictDoNothing();

  const locked = await tx.execute(
    sql`select last_value from receipt_counters
        where branch_id = ${branchId} and year = ${year} for update`,
  );
  const next = Number((locked[0] as { last_value: number } | undefined)?.last_value ?? 0) + 1;

  await tx
    .update(receiptCounters)
    .set({ lastValue: next })
    .where(and(eq(receiptCounters.branchId, branchId), eq(receiptCounters.year, year)));

  return next;
}

export async function insertPayment(
  ctx: TenantContext,
  tx: Tx,
  values: {
    branchId: string;
    invoiceId: string;
    amountPiasters: number;
    method: PaymentMethod;
    receiptYear: number;
    receiptNo: number;
    note: string | null;
    reversesId?: string | null;
  },
): Promise<{ id: string; receiptNo: number }> {
  const [row] = await tx
    .insert(payments)
    .values({ ...values, receivedBy: ctx.userId })
    .returning({ id: payments.id, receiptNo: payments.receiptNo });
  if (!row) throw new Error("insertPayment returned no row");
  return row;
}

export type PaymentRow = {
  id: string;
  amountPiasters: number;
  method: PaymentMethod;
  receiptYear: number;
  receiptNo: number;
  receivedAt: Date;
  note: string | null;
  reversesId: string | null;
  reversed: boolean;
};

export async function listPaymentsForInvoices(
  _ctx: TenantContext,
  tx: Tx,
  invoiceIds: string[],
): Promise<Map<string, PaymentRow[]>> {
  if (invoiceIds.length === 0) return new Map();

  const rows = await tx
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      amountPiasters: payments.amountPiasters,
      method: payments.method,
      receiptYear: payments.receiptYear,
      receiptNo: payments.receiptNo,
      receivedAt: payments.receivedAt,
      note: payments.note,
      reversesId: payments.reversesId,
    })
    .from(payments)
    .where(inArray(payments.invoiceId, invoiceIds))
    .orderBy(desc(payments.receivedAt));

  // "Has somebody already handed this receipt's money back?" is answered from the rows
  // already in hand rather than by a correlated subquery: every payment for these
  // invoices is here, so a reversal's target is too.
  const reversedIds = new Set(rows.flatMap((row) => (row.reversesId ? [row.reversesId] : [])));

  const byInvoice = new Map<string, PaymentRow[]>();
  for (const row of rows) {
    const list = byInvoice.get(row.invoiceId) ?? [];
    list.push({ ...row, reversed: reversedIds.has(row.id) });
    byInvoice.set(row.invoiceId, list);
  }
  return byInvoice;
}

/** One receipt, with everything a printed copy needs. */
export async function findReceipt(
  _ctx: TenantContext,
  tx: Tx,
  paymentId: string,
): Promise<{
  id: string;
  invoiceId: string;
  amountPiasters: number;
  method: PaymentMethod;
  receiptYear: number;
  receiptNo: number;
  receivedAt: Date;
  note: string | null;
  reversesId: string | null;
  period: string;
  studentCode: string;
  fullName: string;
  className: string;
  receivedByName: string | null;
} | null> {
  const [row] = await tx
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      amountPiasters: payments.amountPiasters,
      method: payments.method,
      receiptYear: payments.receiptYear,
      receiptNo: payments.receiptNo,
      receivedAt: payments.receivedAt,
      note: payments.note,
      reversesId: payments.reversesId,
      period: invoices.period,
      studentCode: students.studentCode,
      fullName: students.fullName,
      className: classes.name,
      receivedByName: user.name,
    })
    .from(payments)
    .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
    .innerJoin(students, eq(students.id, invoices.studentId))
    .innerJoin(classes, eq(classes.id, invoices.classId))
    .leftJoin(user, eq(user.id, payments.receivedBy))
    .where(eq(payments.id, paymentId))
    .limit(1);

  return row ?? null;
}

// --- one student's history ----------------------------------------------------

export type StatementInvoice = {
  id: string;
  period: string;
  className: string;
  amountPiasters: number;
  discountPiasters: number;
  discountReason: string | null;
  paidPiasters: number;
};

export async function listInvoicesForStudent(
  _ctx: TenantContext,
  tx: Tx,
  studentId: string,
): Promise<StatementInvoice[]> {
  const rows = await tx
    .select({
      id: invoices.id,
      period: invoices.period,
      className: classes.name,
      amountPiasters: invoices.amountPiasters,
      discountPiasters: invoices.discountPiasters,
      discountReason: invoices.discountReason,
      paidPiasters: sql<number>`coalesce((
        select sum(p.amount_piasters) from payments p where p.invoice_id = ${invoices.id}
      ), 0)::int`,
    })
    .from(invoices)
    .innerJoin(classes, eq(classes.id, invoices.classId))
    .where(eq(invoices.studentId, studentId))
    .orderBy(desc(invoices.period));

  return rows;
}

/** Students to bill for a period: active, with the class they are in NOW. */
export async function listBillableStudents(
  _ctx: TenantContext,
  tx: Tx,
  classId?: string,
): Promise<{ studentId: string; classId: string; branchId: string }[]> {
  const where = [eq(students.status, "active")];
  if (classId) where.push(eq(students.classId, classId));

  return tx
    .select({ studentId: students.id, classId: students.classId, branchId: students.branchId })
    .from(students)
    .where(and(...where));
}

export async function listPlansForClasses(
  _ctx: TenantContext,
  tx: Tx,
): Promise<Map<string, { effectiveFrom: string; amountPiasters: number }[]>> {
  const rows = await tx
    .select({
      classId: feePlans.classId,
      effectiveFrom: feePlans.effectiveFrom,
      amountPiasters: feePlans.amountPiasters,
    })
    .from(feePlans);

  const byClass = new Map<string, { effectiveFrom: string; amountPiasters: number }[]>();
  for (const row of rows) {
    const list = byClass.get(row.classId) ?? [];
    list.push({ effectiveFrom: row.effectiveFrom, amountPiasters: row.amountPiasters });
    byClass.set(row.classId, list);
  }
  return byClass;
}
