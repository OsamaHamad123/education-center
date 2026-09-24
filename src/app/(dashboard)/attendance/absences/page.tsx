import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AbsencesList, getUnexcusedAbsences } from "@/modules/attendance";
import { ReportFilters } from "@/modules/reports";
import { getTerms } from "@/modules/settings";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.absences.title };

/**
 * Every lesson missed without permission in a range (asked for 2026-09-24).
 *
 * Under `/attendance` rather than `/reports` on purpose: it is read by teachers, and
 * `report.read` is an admin permission. The query asks for `attendance.read`, which all
 * three roles hold, and RLS decides what each of them sees.
 */
export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string }>;
}) {
  const params = await searchParams;
  const ctx = await resolveTenantContext();
  if (!ctx) notFound();

  const report = await getUnexcusedAbsences(params);
  if (!report.ok) notFound();

  const termsResult = await getTerms();
  const terms = termsResult.ok ? termsResult.data.terms : [];

  return (
    <>
      <PageHeader
        title={ar.absences.title}
        description={ar.absences.description}
        action={
          <Button asChild variant="outline">
            <Link href="/attendance">
              <ArrowRight className="size-4" aria-hidden />
              {ar.attendance.title}
            </Link>
          </Button>
        }
      />
      <div className="space-y-4">
        <ReportFilters range={{ from: report.data.from, to: report.data.to }} terms={terms} />

        <p className="text-muted-foreground text-sm">
          {report.data.students.length} {ar.absences.students} · {report.data.totalPeriods}{" "}
          {ar.absences.periods} · {ar.absences.excusedNote}
        </p>
        {report.data.truncated ? (
          <p role="status" className="bg-destructive/5 rounded-md p-2 text-sm">
            {ar.absences.truncated}
          </p>
        ) : null}

        <AbsencesList students={report.data.students} linkStudents={ctx.role !== "teacher"} />
      </div>
    </>
  );
}
