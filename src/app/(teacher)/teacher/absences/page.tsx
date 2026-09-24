import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AbsencesList, getUnexcusedAbsences } from "@/modules/attendance";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.absences.title };

/**
 * A teacher's own unexcused absences over a range (asked for 2026-09-24).
 *
 * The same query as the admin page. It is a separate route only because the teacher
 * area has its own layout and navigation — the rows a teacher gets back are decided by
 * `attendance_records_select`, not by which URL they arrived at.
 *
 * No class filter and no student links: a teacher holds neither `class.read` nor
 * `student.read`, so both would be dead controls.
 */
export default async function TeacherAbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const report = await getUnexcusedAbsences(params);
  if (!report.ok) notFound();

  return (
    <>
      <PageHeader title={ar.absences.title} description={ar.absences.teacherDescription} />
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {report.data.students.length} {ar.absences.students} · {report.data.totalPeriods}{" "}
          {ar.absences.periods} · {ar.absences.excusedNote}
        </p>
        <AbsencesList students={report.data.students} linkStudents={false} />
      </div>
    </>
  );
}
