import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listVisibleBranches } from "@/modules/branches";
import { getClassMatrixReport, RegisterPrint } from "@/modules/reports";
import { getCenterIdentity } from "@/modules/settings";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.print.register };

/** كشف الحضور والغياب for one class over a range, on A4 landscape (2026-09-24). */
export default async function PrintRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string }>;
}) {
  const params = await searchParams;
  const ctx = await resolveTenantContext();
  if (!ctx) notFound();

  const [report, identity, branches] = await Promise.all([
    getClassMatrixReport(params),
    getCenterIdentity(),
    listVisibleBranches(),
  ]);
  if (!report.ok || !identity.ok) notFound();

  const branchName =
    (ctx.branchId && branches.ok ? branches.data.find((branch) => branch.id === ctx.branchId) : null)?.name ??
    null;
  const className = report.data.classes.find((option) => option.id === report.data.classId)?.name ?? null;

  return (
    <RegisterPrint
      report={report.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
      className={className}
    />
  );
}
