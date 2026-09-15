import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { AuditFilters, AuditTable, listAuditLogsPage } from "@/modules/audit";
import { listVisibleBranches } from "@/modules/branches";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";
import { Skeleton } from "@/shared/ui/skeleton";

export const metadata: Metadata = { title: ar.audit.title };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) notFound();

  const params = await searchParams;
  const [result, branches] = await Promise.all([listAuditLogsPage(params), listVisibleBranches()]);
  if (!result.ok) notFound();

  return (
    <>
      <PageHeader title={ar.audit.title} description={ar.audit.description} />
      <Suspense fallback={<Skeleton className="h-20 w-full" />}>
        <AuditFilters
          branches={branches.ok ? branches.data : []}
          entities={result.data.entities}
          // A branch admin sees only their own branch anyway; the control would be a
          // dropdown with one option.
          canFilterBranch={hasPermission(user.role, "report.cross_branch")}
        />
        <AuditTable page={result.data} />
      </Suspense>
    </>
  );
}
