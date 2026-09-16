import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AbsenceAlertsList, getAbsenceAlerts, ReportFilters } from "@/modules/reports";
import { getTerms } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.reports.absenceAlerts };

export default async function AbsenceAlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; threshold?: string }>;
}) {
  const params = await searchParams;
  const threshold = Number(params.threshold);

  const report = await getAbsenceAlerts({
    from: params.from,
    to: params.to,
    // A nonsense threshold in the URL falls back to the centre setting rather than
    // erroring: it is a query string, not a submitted form.
    threshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 100 ? threshold : undefined,
  });
  if (!report.ok) notFound();

  // The centre's calendar as a date preset (§16 q7). A centre with no terms sees no
  // picker, and nothing else about the report changes.
  const termsResult = await getTerms();
  const terms = termsResult.ok ? termsResult.data.terms : [];

  return (
    <>
      <PageHeader
        title={ar.reports.absenceAlerts}
        description={ar.reports.absenceAlertsDescription}
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
        <ReportFilters range={report.data.range} terms={terms} />
        <AbsenceAlertsList report={report.data} />
      </div>
    </>
  );
}
