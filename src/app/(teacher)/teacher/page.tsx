import { notFound } from "next/navigation";
import { getMyToday, getTodayAbsences, TeacherTodayView, TodayAbsencesCard } from "@/modules/attendance";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

/** The teacher portal home: today's lessons across every branch (rule 10.9). */
export default async function TeacherHomePage() {
  const user = await getSessionUser();
  if (!user) notFound();

  const [today, absences] = await Promise.all([getMyToday(), getTodayAbsences()]);
  if (!today.ok) notFound();

  return (
    <>
      <PageHeader title={ar.attendance.myToday} description={ar.attendance.myTodayDescription} />
      <div className="space-y-4">
        <TeacherTodayView today={today.data} />

        {/*
          The same card the branch admin sees, holding different rows: a teacher is
          admitted by `attendance_records_select` only to lessons that are theirs, so
          "my students who were not in MY lesson" needs no filter written here.

          Names are not links — a teacher has no `student.read`, and a link they cannot
          follow is worse than plain text.
        */}
        {absences.ok ? (
          <TodayAbsencesCard students={absences.data} linkStudents={false} href="/teacher/absences" />
        ) : null}
      </div>
    </>
  );
}
