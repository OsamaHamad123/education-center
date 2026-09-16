import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ClassMatrix, getClassMatrixReport, ReportFilters } from "@/modules/reports";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.reports.classMatrix };

export default async function ClassMatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string }>;
}) {
  const params = await searchParams;
  const report = await getClassMatrixReport(params);
  if (!report.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.reports.classMatrix}
        description={ar.reports.classMatrixDescription}
        action={
          <Button asChild variant="outline">
            <Link href="/reports">
              <ArrowRight className="size-4" aria-hidden />
              {ar.reports.title}
            </Link>
          </Button>
        }
      />
      <div className="space-y-4">
        <ReportFilters
          range={report.data.range}
          classes={report.data.classes}
          classId={report.data.classId}
        />
        <ClassMatrix report={report.data} />
      </div>
    </>
  );
}
