import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Archive, Plus } from "lucide-react";
import { listClassOptions } from "@/modules/classes";
import { ImportStudentsDialog, listStudentsPage, StudentsFilters, StudentsTable } from "@/modules/students";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { Skeleton } from "@/shared/ui/skeleton";

export const metadata: Metadata = { title: ar.students.title };

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await resolveTenantContext();
  const [page, classes] = await Promise.all([listStudentsPage(params), listClassOptions()]);
  if (!page.ok || !ctx) notFound();

  return (
    <>
      <PageHeader
        title={ar.students.title}
        count={page.data.total}
        description={ar.students.description}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" asChild>
              <Link href="/students/archive">
                <Archive className="size-4" aria-hidden />
                {ar.students.archiveTitle}
              </Link>
            </Button>
            {ctx.branchId ? (
              <>
                <ImportStudentsDialog />
                <Button asChild>
                  <Link href="/students/new">
                    <Plus className="size-4" aria-hidden />
                    {ar.students.add}
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <StudentsFilters
          classes={classes.ok ? classes.data : []}
          status="active"
          canSeeTransferredOut={ctx.branchId !== null}
        />
        <StudentsTable page={page.data} viewerBranchId={ctx.branchId} />
      </Suspense>
    </>
  );
}
