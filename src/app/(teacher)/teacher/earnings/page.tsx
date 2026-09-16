import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPayrollReport, PayrollReportView } from "@/modules/payroll";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.payroll.myEarnings };

/**
 * A teacher's own earnings (rule 10.9). The same report the admin sees, narrowed to
 * them — not by a filter this page applies, but by `class_sessions_select`, which
 * shows a teacher only their own sessions in every branch they work in.
 */
export default async function TeacherEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user?.teacherId) notFound();

  const params = await searchParams;
  const report = await getPayrollReport({
    from: params.from,
    to: params.to,
    // Belt and braces over the policy: a teacher asks only about themselves.
    teacherId: user.teacherId,
  });
  if (!report.ok) notFound();

  return (
    <>
      <PageHeader title={ar.payroll.myEarnings} description={ar.payroll.descriptionTeacher} />
      <PayrollReportView report={report.data} />
    </>
  );
}
