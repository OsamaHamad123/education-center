import { notFound } from "next/navigation";
import { getMyToday, TeacherTodayView } from "@/modules/attendance";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { PageHeader } from "@/shared/ui/page-header";

/** The teacher portal home: today's lessons across every branch (rule 10.9). */
export default async function TeacherHomePage() {
  const user = await getSessionUser();
  if (!user) notFound();

  const today = await getMyToday();
  if (!today.ok) notFound();

  return (
    <>
      <PageHeader title={ar.attendance.myToday} description={ar.attendance.myTodayDescription} />
      <TeacherTodayView today={today.data} />
    </>
  );
}
