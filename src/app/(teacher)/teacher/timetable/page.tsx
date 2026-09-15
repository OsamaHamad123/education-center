import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { getMyTimetable, TeacherTimetableView } from "@/modules/timetable";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.timetable.myTimetable };

/** The teacher's own week, across every branch they teach in (PROJECT_PLAN 10.9). */
export default async function MyTimetablePage() {
  const user = await getSessionUser();
  if (!user?.teacherId) notFound();

  const timetable = await getMyTimetable();
  if (!timetable.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.timetable.myTimetable}
        description={ar.timetable.myTimetableDescription}
        action={
          <Button asChild variant="outline">
            <Link href={`/print/timetable/teacher/${user.teacherId}`} target="_blank">
              <Printer className="size-4" aria-hidden />
              {ar.common.print}
            </Link>
          </Button>
        }
      />
      <TeacherTimetableView timetable={timetable.data} showBranch />
    </>
  );
}
