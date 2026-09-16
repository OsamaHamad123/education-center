import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import {
  AttendanceBoardView,
  getAttendanceBoard,
  getSessionLog,
  listAttendanceClasses,
} from "@/modules/attendance";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { isIsoDate, todayInCairo } from "@/shared/lib/time";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.attendance.title };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  if (!user || !ctx) notFound();

  const header = (
    <PageHeader
      title={ar.attendance.title}
      description={ar.attendance.description}
      action={
        <Button asChild variant="outline">
          <Link href="/attendance/sessions">
            <ListChecks className="size-4" aria-hidden />
            {ar.attendance.sessions}
          </Link>
        </Button>
      }
    />
  );

  // Marking is branch-scoped, so "كافة الفروع" has no register to open.
  if (ctx.branchId === null) {
    return (
      <>
        {header}
        <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.attendance.description} />
      </>
    );
  }

  const classes = await listAttendanceClasses();
  if (!classes.ok) notFound();
  if (classes.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState title={ar.attendance.noClasses} description={ar.timetable.noClassesHint} />
      </>
    );
  }

  const { classId, date } = await searchParams;
  const selected = classes.data.find((option) => option.id === classId);
  // A class from another branch is nothing to explain — open the first one instead.
  // The date is resolved BEFORE it goes into that URL: the redirect used to carry an
  // unusable one straight through to the next request, which then crashed on it.
  const sessionDate = isIsoDate(date) ? date : todayInCairo();
  if (!selected) redirect(`/attendance?classId=${classes.data[0]?.id ?? ""}&date=${sessionDate}`);

  const board = await getAttendanceBoard({ classId: selected.id, sessionDate });
  if (!board.ok) notFound();

  // The extra-session dialog needs the branch's teachers and the subject list; the
  // log query already assembles exactly those, scoped to this branch.
  const log = await getSessionLog({ from: board.data.sessionDate, to: board.data.sessionDate });

  return (
    <>
      {header}
      <AttendanceBoardView
        board={board.data}
        teachers={log.ok ? log.data.teachers : []}
        subjects={log.ok ? log.data.subjects : []}
        canManage={hasPermission(user.role, "session.manage")}
      />
    </>
  );
}
