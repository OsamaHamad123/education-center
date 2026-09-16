import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { getPayrollReport, PayrollReportView } from "@/modules/payroll";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.payroll.title };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; teacherId?: string; branchId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) notFound();

  const params = await searchParams;
  const report = await getPayrollReport(params);
  if (!report.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.payroll.title}
        description={ar.payroll.description}
        action={
          hasPermission(user.role, "payroll.settle") ? (
            <Button asChild variant="outline">
              <Link href="/payroll/runs">
                <Wallet className="size-4" aria-hidden />
                {ar.payroll.runs}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <PayrollReportView report={report.data} />
    </>
  );
}
