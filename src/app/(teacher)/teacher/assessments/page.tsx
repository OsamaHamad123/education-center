import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AssessmentsTable, getAssessments } from "@/modules/assessments";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.assessments.title };

/**
 * A teacher's own papers (`drizzle/0021`).
 *
 * The same query and the same table as the office's screen. It returns different ROWS
 * because `assessments_select` admits a teacher only to their own — there is no filter
 * in this file, and there must not be one.
 *
 * The publish and archive controls are absent because `getAssessments` reports
 * `canPublish: false` for a teacher, which is the office's decision, not a layout one.
 */
export default async function TeacherAssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string }>;
}) {
  const params = await searchParams;
  const list = await getAssessments(params);
  if (!list.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.assessments.title}
        count={list.data.rows.length}
        description={ar.assessments.teacherDescription}
      />
      <AssessmentsTable list={list.data} basePath="/teacher/assessments" />
    </>
  );
}
