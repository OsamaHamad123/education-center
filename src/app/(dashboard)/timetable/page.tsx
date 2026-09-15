import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { getClassTimetable, listCopySources, listTimetableClasses, TimetableGrid } from "@/modules/timetable";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.timetable.title };

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  if (!user || !ctx) notFound();

  const classes = await listTimetableClasses();
  if (!classes.ok) notFound();

  const header = (
    <PageHeader
      title={ar.timetable.title}
      description={ar.timetable.description}
      action={
        hasPermission(user.role, "timetable.settings") ? (
          <Button asChild variant="outline">
            <Link href="/timetable/settings">
              <Settings2 className="size-4" aria-hidden />
              {ar.timetable.settings}
            </Link>
          </Button>
        ) : null
      }
    />
  );

  // Creating and editing a timetable is branch-scoped, so "كافة الفروع" has no grid.
  if (ctx.branchId === null) {
    return (
      <>
        {header}
        <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.timetable.description} />
      </>
    );
  }

  if (classes.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={ar.timetable.noClasses} description={ar.timetable.noClassesHint} />
      </>
    );
  }

  const { classId } = await searchParams;
  const selected = classes.data.find((option) => option.id === classId);
  // A classId from another branch is not an error to explain — just pick the first.
  if (!selected) redirect(`/timetable?classId=${classes.data[0]?.id ?? ""}`);

  const [timetable, copySources] = await Promise.all([
    getClassTimetable(selected.id),
    listCopySources(selected.id),
  ]);
  if (!timetable.ok) notFound();

  return (
    <>
      {header}
      <TimetableGrid
        timetable={timetable.data}
        classes={classes.data}
        selectedClassId={selected.id}
        copySources={copySources.ok ? copySources.data : []}
        canWrite={hasPermission(user.role, "timetable.write")}
      />
    </>
  );
}
