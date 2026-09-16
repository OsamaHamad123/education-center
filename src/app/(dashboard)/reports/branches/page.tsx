import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BranchComparisonView, getBranchComparison, ReportFilters } from "@/modules/reports";
import { getTerms } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.reports.comparison };

/**
 * Super admin only. The permission is checked inside the query, so a branch admin who
 * types the URL gets a 404 rather than a 403 — the page does not exist for them.
 */
export default async function BranchComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const comparison = await getBranchComparison(params);
  if (!comparison.ok) notFound();

  // The centre's calendar as a date preset (§16 q7). A centre with no terms sees no
  // picker, and nothing else about the report changes.
  const termsResult = await getTerms();
  const terms = termsResult.ok ? termsResult.data.terms : [];

  return (
    <>
      <PageHeader
        title={ar.reports.comparison}
        description={ar.reports.comparisonDescription}
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
        <ReportFilters range={comparison.data.range} terms={terms} />
        <BranchComparisonView comparison={comparison.data} />
      </div>
    </>
  );
}
