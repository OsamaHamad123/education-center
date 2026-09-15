import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { AttendanceSheetView, getAttendanceSheet } from "@/modules/attendance";
import { ar } from "@/shared/i18n/ar";
import { todayInCairo } from "@/shared/lib/time";

export const metadata: Metadata = { title: ar.attendance.sheetTitle };

/**
 * One period's register. Addressed by class + date + period rather than by session id,
 * because the session does not exist until the first save (rule 10.5) — the screen has
 * to be reachable before there is anything to point at.
 */
export default async function MarkAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string; period?: string }>;
}) {
  const { classId, date, period } = await searchParams;

  const parsed = z
    .object({
      classId: z.uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      period: z.coerce.number().int().min(1).max(12),
    })
    .safeParse({ classId, date: date ?? todayInCairo(), period: period ?? "1" });
  if (!parsed.success) notFound();

  const sheet = await getAttendanceSheet({
    classId: parsed.data.classId,
    sessionDate: parsed.data.date,
    periodNumber: parsed.data.period,
  });
  if (!sheet.ok) notFound();

  return (
    <AttendanceSheetView
      sheet={sheet.data}
      backHref={`/attendance?classId=${parsed.data.classId}&date=${parsed.data.date}`}
    />
  );
}
