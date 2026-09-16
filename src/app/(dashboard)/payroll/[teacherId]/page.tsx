import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { z } from "zod";
import { getPayrollSessions, PayrollSessionsView, startOfMonth } from "@/modules/payroll";
import { ar } from "@/shared/i18n/ar";
import { todayInCairo } from "@/shared/lib/time";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.payroll.details };

/** The drill-down: which lessons make up one teacher's total (rule 10.6). */
export default async function PayrollDrillDownPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ from?: string; to?: string; branchId?: string }>;
}) {
  const { teacherId } = await params;
  if (!z.uuid().safeParse(teacherId).success) notFound();

  const query = await searchParams;
  const today = todayInCairo();

  const drillDown = await getPayrollSessions({
    teacherId,
    from: query.from ?? startOfMonth(today),
    to: query.to ?? today,
    branchId: query.branchId,
  });
  // A teacher not in this viewer's reach is not "forbidden" — RLS never showed them.
  if (!drillDown.ok) notFound();

  return (
    <>
      <PageHeader
        title={`${ar.payroll.detailsFor} ${drillDown.data.teacherName}`}
        description={ar.payroll.cancelledExcluded}
        action={
          <Button asChild variant="outline">
            <Link href="/payroll">
              <ArrowRight className="size-4" aria-hidden />
              {ar.payroll.title}
            </Link>
          </Button>
        }
      />
      <PayrollSessionsView
        teacherName={drillDown.data.teacherName}
        sessions={drillDown.data.sessions}
        truncated={drillDown.data.truncated}
      />
    </>
  );
}
