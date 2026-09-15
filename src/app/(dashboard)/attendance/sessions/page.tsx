import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSessionLog, SessionsFilters, SessionsTable } from "@/modules/attendance";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.attendance.sessions };

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    classId?: string;
    teacherId?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;

  const log = await getSessionLog({
    from: params.from,
    to: params.to,
    classId: params.classId,
    teacherId: params.teacherId,
    // An unknown status filter is dropped rather than refused: it is a URL, and a
    // typo in one should not be an error page.
    status: params.status === "completed" || params.status === "cancelled" ? params.status : undefined,
  });
  if (!log.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.attendance.sessions}
        description={ar.attendance.sessionsDescription}
        action={
          <Button asChild variant="outline">
            <Link href="/attendance">
              <ArrowRight className="size-4" aria-hidden />
              {ar.attendance.title}
            </Link>
          </Button>
        }
      />

      <div className="space-y-4">
        <SessionsFilters log={log.data} />
        <SessionsTable rows={log.data.rows} teachers={log.data.teachers} canManage={log.data.canManage} />
      </div>
    </>
  );
}
