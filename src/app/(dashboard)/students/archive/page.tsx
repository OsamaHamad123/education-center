import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { listClassOptions } from "@/modules/classes";
import { listStudentsPage, StudentsFilters, StudentsTable } from "@/modules/students";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";
import { Skeleton } from "@/shared/ui/skeleton";

export const metadata: Metadata = { title: ar.students.archiveTitle };

export default async function StudentsArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await resolveTenantContext();
  const [page, classes] = await Promise.all([
    listStudentsPage({ ...params, status: "archived" }),
    listClassOptions(),
  ]);
  if (!page.ok || !ctx) notFound();

  return (
    <>
      <PageHeader
        title={ar.students.archiveTitle}
        description={ar.students.archiveDescription}
        action={
          <Button variant="ghost" asChild>
            <Link href="/students">
              <ArrowRight className="size-4" aria-hidden />
              {ar.students.title}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <StudentsFilters
          classes={classes.ok ? classes.data : []}
          status="archived"
          canSeeTransferredOut={false}
        />
        <StudentsTable page={page.data} viewerBranchId={ctx.branchId} />
      </Suspense>
    </>
  );
}
