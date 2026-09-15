import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { AttendanceSheetView, getAttendanceSheet, resolveSlotForMarking } from "@/modules/attendance";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.attendance.sheetTitle };

/**
 * A teacher marking their own register.
 *
 * Addressed by the TIMETABLE SLOT, not the session: sessions are created lazily on the
 * first save, so an unmarked period has no id to link to. PROJECT_PLAN section 11
 * writes this route as `/teacher/attendance/[sessionId]`; see the deviation recorded
 * in docs/PROGRESS.md.
 *
 * The date is not in the URL either — a teacher marks today, and only today.
 */
export default async function TeacherMarkPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  if (!z.uuid().safeParse(slotId).success) notFound();

  const resolved = await resolveSlotForMarking(slotId);
  if (!resolved.ok) notFound();

  const sheet = await getAttendanceSheet(resolved.data);
  if (!sheet.ok) notFound();

  return <AttendanceSheetView sheet={sheet.data} backHref="/teacher" />;
}
