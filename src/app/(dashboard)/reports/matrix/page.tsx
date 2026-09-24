import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";
import { ClassMatrix, getClassMatrixReport, ReportFilters } from "@/modules/reports";
import { getTerms } from "@/modules/settings";
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

  // The centre's calendar as a date preset (§16 q7). A centre with no terms sees no
  // picker, and nothing else about the report changes.
  const termsResult = await getTerms();
  const terms = termsResult.ok ? termsResult.data.terms : [];

  return (
    <>
      <PageHeader
        title={ar.reports.classMatrix}
        description={ar.reports.classMatrixDescription}
        action={
          <div className="flex flex-wrap gap-2">
            {/*
              The filters the viewer is actually looking at, carried into the print
              route — a print button that printed the DEFAULT range would be a sheet
              nobody asked for.
            */}
            <Button asChild variant="outline">
              <Link
                href={`/print/reports/register?from=${report.data.range.from}&to=${report.data.range.to}${
                  report.data.classId ? `&classId=${report.data.classId}` : ""
                }`}
                target="_blank"
              >
                <Printer className="size-4" aria-hidden />
                {ar.print.print}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reports">
                <ArrowRight className="size-4" aria-hidden />
                {ar.reports.title}
              </Link>
            </Button>
          </div>
        }
      />
      <div className="space-y-4">
        <ReportFilters
          range={report.data.range}
          classes={report.data.classes}
          classId={report.data.classId}
          terms={terms}
        />
        <ClassMatrix report={report.data} />
      </div>
    </>
  );
}
