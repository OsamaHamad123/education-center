import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listVisibleBranches } from "@/modules/branches";
import { getPayrollReport, PayrollPrint } from "@/modules/payroll";
import { getCenterIdentity } from "@/modules/settings";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.print.payroll };

export default async function PrintPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; teacherId?: string; branchId?: string }>;
}) {
  const params = await searchParams;
  const ctx = await resolveTenantContext();
  if (!ctx) notFound();
  // `payroll.read` includes teachers, because they see their own earnings at
  // `/teacher/earnings`. RLS kept this sheet to their own rows, so nothing leaked — but
  // it is the OFFICE's document, signature column and all, and this was the one route
  // group with no role gate (docs/AUDIT-2026-09.md, finding 8).
  if (ctx.role === "teacher") notFound();

  const [report, identity, branches] = await Promise.all([
    getPayrollReport(params),
    getCenterIdentity(),
    listVisibleBranches(),
  ]);
  if (!report.ok || !identity.ok) notFound();

  // The header names the branch this sheet covers: the one filtered to, or the
  // viewer's own. A super admin across every branch gets no branch line at all.
  const headerBranchId = report.data.branchId ?? ctx.branchId;
  const branchName =
    (headerBranchId && branches.ok ? branches.data.find((branch) => branch.id === headerBranchId) : null)
      ?.name ?? null;

  return (
    <PayrollPrint
      report={report.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
    />
  );
}
