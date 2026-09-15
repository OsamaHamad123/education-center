import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { WEEK_DISPLAY_ORDER } from "@/shared/lib/time";
import { listSlotsForTeacher } from "../../infrastructure/timetable.repository";

export type TeacherSlot = {
  id: string;
  branchName: string;
  className: string;
  subjectName: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
};

export type TeacherTimetable = {
  teacherId: string;
  /** Only the days the teacher actually works, in display order. */
  days: number[];
  byDay: Record<number, TeacherSlot[]>;
  slotCount: number;
};

/**
 * A teacher's week. Which branches appear is decided entirely by RLS
 * (`timetable_slots_select`), not by a filter here:
 *
 *   super admin  → every branch;
 *   branch admin → only their own, even for a teacher who works in three;
 *   the teacher   → all of their own slots, everywhere they teach.
 *
 * So the same query is safe for all three, and a branch admin printing a shared
 * teacher's timetable gets their branch's half of it and no hint of the rest.
 */
export async function getTeacherTimetable(teacherId: string): Promise<Result<TeacherTimetable>> {
  const auth = await requirePermission("timetable.read");
  if (!auth.ok) return auth;

  const slots = await withTenant(auth.data, (tx) => listSlotsForTeacher(auth.data, tx, teacherId));

  const byDay: Record<number, TeacherSlot[]> = {};
  for (const slot of slots) {
    (byDay[slot.dayOfWeek] ??= []).push({
      id: slot.id,
      branchName: slot.branchName,
      className: slot.className,
      subjectName: slot.subjectName,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
      startTime: slot.startTime.slice(0, 5),
      endTime: slot.endTime.slice(0, 5),
    });
  }

  return ok({
    teacherId,
    days: WEEK_DISPLAY_ORDER.filter((day) => (byDay[day]?.length ?? 0) > 0),
    byDay,
    slotCount: slots.length,
  });
}

/** The signed-in teacher's own week, for the portal (rule 10.9). */
export async function getMyTimetable(): Promise<Result<TeacherTimetable>> {
  const auth = await requirePermission("timetable.read");
  if (!auth.ok) return auth;
  if (!auth.data.teacherId) return err("FORBIDDEN", ar.errors.FORBIDDEN);

  return getTeacherTimetable(auth.data.teacherId);
}
