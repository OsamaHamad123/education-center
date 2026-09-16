"use server";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { requirePermission } from "@/shared/actions/create-action";
import { classes, invoices, payments, students, user } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { toCsv } from "@/shared/lib/csv";
import { piastersToPounds } from "@/shared/lib/money";
import { ok, type Result } from "@/shared/lib/result";
import { isValidPeriod } from "../../domain/ledger";

/**
 * Every receipt of a month, as a CSV (docs/ROADMAP.md, item 3).
 *
 * Whoever keeps the centre's books will ask for this in the first month, and the answer
 * cannot be "read it off the screen". Payroll and students already export; the money
 * coming IN did not.
 *
 * Amounts are written in POUNDS with two decimals, because a spreadsheet is where this
 * is going and nobody reconciles a receipt in piasters. The conversion happens once,
 * here, at the very edge.
 *
 * REVERSALS are rows, not omissions. A cancelled receipt appears with its negative
 * amount and its own number, because the family was handed paper with that number on it
 * and a book that quietly skips it does not reconcile.
 */
export async function exportPaymentsCsv(input: { period?: string | undefined }): Promise<Result<string>> {
  const auth = await requirePermission("fee.read");
  if (!auth.ok) return auth;

  const period = isValidPeriod(input.period) ? input.period : "";
  // Receipts are exported by the month they were RECEIVED in, not by the month they
  // pay for: that is the month the books are closing.
  const from = period ? new Date(`${period}-01T00:00:00Z`) : new Date(0);
  const to = period
    ? new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1))
    : new Date();

  const rows = await withTenant(auth.data, (tx) =>
    tx
      .select({
        receiptYear: payments.receiptYear,
        receiptNo: payments.receiptNo,
        receivedAt: payments.receivedAt,
        amountPiasters: payments.amountPiasters,
        method: payments.method,
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
      .where(and(gte(payments.receivedAt, from), lte(payments.receivedAt, to)))
      .orderBy(asc(payments.receiptYear), asc(payments.receiptNo)),
  );

  const headers = [
    ar.fees.receiptNo,
    ar.attendance.date,
    ar.students.code,
    ar.fees.student,
    ar.fees.class,
    ar.fees.period,
    ar.fees.amount,
    ar.fees.method,
    ar.fees.receivedBy,
    ar.fees.note,
  ];

  return ok(
    toCsv(
      headers,
      rows.map((row) => [
        `${row.receiptYear}/${row.receiptNo}`,
        row.receivedAt.toISOString().slice(0, 10),
        row.studentCode,
        row.fullName,
        row.className,
        row.period,
        piastersToPounds(row.amountPiasters).toFixed(2),
        ar.fees.methods[row.method],
        row.receivedByName ?? "",
        // The reversal's reason is its note, so nothing extra is needed to explain a
        // negative line.
        row.reversesId ? `${ar.fees.reversal} — ${row.note ?? ""}` : (row.note ?? ""),
      ]),
    ),
  );
}
