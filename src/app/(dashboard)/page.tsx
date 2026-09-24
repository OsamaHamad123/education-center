import Link from "next/link";
import { BarChart3, Wallet } from "lucide-react";
import { getTodayAbsences, TodayAbsencesCard } from "@/modules/attendance";
import {
  BranchComparisonView,
  BranchDashboardView,
  getBranchComparison,
  getBranchDashboard,
} from "@/modules/reports";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

/**
 * The dashboard (rule 10.7). What it shows depends on scope, not on role:
 *
 *   a branch selected  → today's pulse for that branch;
 *   "كافة الفروع"      → the cross-branch comparison, which is the only thing that
 *                        makes sense when no branch is selected.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  if (!user || !ctx) return null;

  const header = (
    <PageHeader
      title={`${ar.dashboard.welcome}، ${user.name}`}
      description={ar.roles[user.role]}
      action={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/reports">
              <BarChart3 className="size-4" aria-hidden />
              {ar.reports.title}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/payroll">
              <Wallet className="size-4" aria-hidden />
              {ar.payroll.title}
            </Link>
          </Button>
        </div>
      }
    />
  );

  if (ctx.branchId === null) {
    const comparison = await getBranchComparison({});
    return (
      <>
        {header}
        {comparison.ok ? (
          <BranchComparisonView comparison={comparison.data} />
        ) : (
          <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.reports.description} />
        )}
      </>
    );
  }

  // Two reads rather than one query: the absences are `attendance.read` and the pulse
  // is `report.read`, and keeping them apart is what lets the teacher's dashboard reuse
  // the same card without holding a reporting permission.
  const [dashboard, absences] = await Promise.all([getBranchDashboard(), getTodayAbsences()]);

  return (
    <>
      {header}
      <div className="space-y-4">
        {dashboard.ok ? (
          <BranchDashboardView dashboard={dashboard.data} />
        ) : (
          <EmptyState title={ar.reports.empty} description={ar.reports.emptyHint} />
        )}

        {/* Who was not in a lesson today, even for one period (asked for 2026-09-24). */}
        {absences.ok ? <TodayAbsencesCard students={absences.data} linkStudents /> : null}
      </div>
    </>
  );
}
