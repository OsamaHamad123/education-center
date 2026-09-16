import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getMyPayouts,
  getPayrollReport,
  getPayrollSessions,
  PayrollReportView,
  PayrollSessionsView,
  startOfMonth,
  TeacherPayouts,
} from "@/modules/payroll";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { todayInCairo } from "@/shared/lib/time";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.payroll.myEarnings };

/**
 * A teacher's own earnings and the lessons behind them (rule 10.9).
 *
 * The same report an admin sees, narrowed to them — not by a filter this page
 * applies, but by `class_sessions_select`, which shows a teacher only their own
 * sessions, in every branch they work in. Read-only: there is no action on the page.
 */
export default async function TeacherEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user?.teacherId) notFound();

  const params = await searchParams;
  const today = todayInCairo();
  const from = params.from ?? startOfMonth(today);
  const to = params.to ?? today;

  const [report, sessions, payouts] = await Promise.all([
    // Belt and braces over the policy: a teacher asks only about themselves.
    getPayrollReport({ from, to, teacherId: user.teacherId }),
    getPayrollSessions({ teacherId: user.teacherId, from, to }),
    getMyPayouts(user.teacherId),
  ]);
  if (!report.ok) notFound();

  return (
    <>
      <PageHeader title={ar.payroll.myEarnings} description={ar.payroll.descriptionTeacher} />

      <div className="space-y-6">
        <PayrollReportView report={report.data} />

        {/* "شهر ٨: مدفوع" — the question a teacher used to have to ASK. */}
        {payouts.ok ? <TeacherPayouts payouts={payouts.data} /> : null}

        {sessions.ok ? (
          <section className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">{ar.payroll.details}</h2>
            <PayrollSessionsView
              teacherName={sessions.data.teacherName}
              sessions={sessions.data.sessions}
              truncated={sessions.data.truncated}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
