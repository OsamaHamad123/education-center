import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";
import { getStudentAttendanceReport, ReportFilters, StudentAttendanceTable } from "@/modules/reports";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.reports.studentAttendance };

export default async function StudentAttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string }>;
}) {
  const params = await searchParams;
  const report = await getStudentAttendanceReport(params);
  if (!report.ok) notFound();

  const printHref = `/print/reports/students?from=${report.data.range.from}&to=${report.data.range.to}${
    report.data.classId ? `&classId=${report.data.classId}` : ""
  }`;

  return (
    <>
      <PageHeader
        title={ar.reports.studentAttendance}
        description={ar.reports.studentAttendanceDescription}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={printHref} target="_blank">
                <Printer className="size-4" aria-hidden />
                {ar.common.print}
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
          allClassesLabel={ar.attendance.allClasses}
        />
        <StudentAttendanceTable rows={report.data.rows} />
      </div>
    </>
  );
}
