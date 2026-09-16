import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getMoneyReport, MoneyReportView } from "@/modules/reports";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.money.title };

/**
 * The centre's money for a month, across branches (docs/ROADMAP.md, item 2).
 *
 * Read-only and cross-branch: `/fees` and `/payroll/runs` both refuse "كافة الفروع",
 * correctly, and this is the screen that answers the owner's own question instead.
 */
export default async function MoneyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const report = await getMoneyReport(params);
  // A branch admin has no business with another branch's takings: 404, not an
  // explanation that the screen exists.
  if (!report.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.money.title}
        description={ar.money.description}
        action={
          <Button asChild variant="outline">
            <Link href="/reports">
              <ArrowRight className="size-4" aria-hidden />
              {ar.reports.title}
            </Link>
          </Button>
        }
      />
      <MoneyReportView report={report.data} />
    </>
  );
}
