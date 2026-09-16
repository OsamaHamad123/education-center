"use server";

import { requirePermission } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { toCsv } from "@/shared/lib/csv";
import { piastersToPounds } from "@/shared/lib/money";
import { ok, type Result } from "@/shared/lib/result";
import { getPayrollReport } from "../queries/get-payroll";

/**
 * Payroll as a CSV (rule 10.6).
 *
 * Amounts are written in POUNDS with two decimals, because a spreadsheet is where
 * this file is going and nobody reconciles a bank transfer in piasters. The
 * conversion happens once, here, at the very edge — the totals themselves travelled
 * as integers the whole way.
 *
 * It returns the text rather than a URL: payroll is a list of what people are paid,
 * and a downloadable link is a link that can be forwarded or logged.
 */
export async function exportPayrollCsv(input: {
  from?: string | undefined;
  to?: string | undefined;
  teacherId?: string | undefined;
  branchId?: string | undefined;
}): Promise<Result<string>> {
  const auth = await requirePermission("payroll.read");
  if (!auth.ok) return auth;

  const report = await getPayrollReport(input);
  if (!report.ok) return report;

  const headers = [
    ar.payroll.teacher,
    ar.payroll.branch,
    ar.payroll.scientificSessions,
    ar.payroll.scientificAmount,
    ar.payroll.literarySessions,
    ar.payroll.literaryAmount,
    ar.payroll.sessions,
    ar.payroll.total,
  ];
  const rows: string[][] = [];

  for (const teacher of report.data.teachers) {
    for (const branch of teacher.earnings.branches) {
      rows.push([
        teacher.teacherName,
        teacher.branchNames[branch.branchId] ?? "",
        String(branch.scientific.sessions),
        pounds(branch.scientific.amountPiasters),
        String(branch.literary.sessions),
        pounds(branch.literary.amountPiasters),
        String(branch.sessions),
        pounds(branch.amountPiasters),
      ]);
    }
  }

  rows.push([
    ar.payroll.grandTotal,
    "",
    "",
    "",
    "",
    "",
    String(report.data.totalSessions),
    pounds(report.data.totalPiasters),
  ]);

  return ok(toCsv(headers, rows));
}

function pounds(piasters: number): string {
  return piastersToPounds(piasters).toFixed(2);
}
