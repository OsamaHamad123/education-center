import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AssessmentsTable, getAssessments } from "@/modules/assessments";
import { ReportFilters } from "@/modules/reports";
import { getTerms } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.assessments.title };

/** الدرجات for the office (`drizzle/0021`). Teachers have their own route. */
export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string; subjectId?: string }>;
}) {
  const params = await searchParams;
  const list = await getAssessments(params);
  if (!list.ok) notFound();

  const termsResult = await getTerms();
  const terms = termsResult.ok ? termsResult.data.terms : [];

  return (
    <>
      <PageHeader
        title={ar.assessments.title}
        count={list.data.rows.length}
        description={ar.assessments.description}
      />
      <div className="space-y-4">
        <ReportFilters
          range={list.data.range}
          classes={list.data.classes}
          classId={list.data.classId}
          terms={terms}
        />
        <AssessmentsTable list={list.data} basePath="/assessments" />
      </div>
    </>
  );
}
