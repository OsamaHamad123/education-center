import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSettlements, SettlementsScreen } from "@/modules/payroll";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.payroll.runs };

/** Paying the teachers for a month (drizzle/0016). */
export default async function PayrollRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) notFound();

  const params = await searchParams;
  const view = await getSettlements(params);

  const header = (
    <PageHeader
      title={ar.payroll.runs}
      description={ar.payroll.runsDescription}
      action={
        <Button asChild variant="outline">
          <Link href="/payroll">
            <ArrowRight className="size-4" aria-hidden />
            {ar.payroll.title}
          </Link>
        </Button>
      }
    />
  );

  if (!view.ok) {
    // Settling is a branch's act: it pays its own teachers for its own lessons.
    if (view.error.code === "BRANCH_REQUIRED") {
      return (
        <>
          {header}
          <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.payroll.runsDescription} />
        </>
      );
    }
    notFound();
  }

  return (
    <>
      {header}
      <SettlementsScreen view={view.data} canSettle={hasPermission(user.role, "payroll.settle")} />
    </>
  );
}
