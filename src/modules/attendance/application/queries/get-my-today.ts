import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { isoDayOfWeek, todayInCairo } from "@/shared/lib/time";
import { canMarkAttendance, type MarkingViolation } from "../../domain/edit-window";
import {
  countMarksBySession,
  findSlotContext,
  listSessions,
  listTeacherDayPeriods,
} from "../../infrastructure/attendance.repository";
import { loadMarkingPolicy } from "./marking-policy";

/**
 * The teacher portal's home screen (PROJECT_PLAN 10.9): today's lessons, in every
 * branch they work in, each saying whether the register is done.
 *
 * A teacher's reach is decided by RLS on `timetable_slots` and `class_sessions`, not
 * by anything filtered here — they see their own rows and nothing else, even in a
 * branch whose admin cannot see them back.
 */

export type TodayPeriod = {
  slotId: string;
  classId: string;
  className: string;
  branchName: string | null;
  subjectName: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  sessionId: string | null;
  markedCount: number;
  cancelled: boolean;
};

export type TeacherToday = {
  date: string;
  periods: TodayPeriod[];
  /** Null when the teacher may mark today; otherwise why not (e.g. setting is off). */
  blockedBy: MarkingViolation | null;
};

export async function getMyToday(): Promise<Result<TeacherToday>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;

  const teacherId = auth.data.teacherId;
  if (!teacherId) return err("FORBIDDEN", ar.errors.FORBIDDEN);

  const date = todayInCairo();

  return withTenant(auth.data, async (tx) => {
    const slots = await listTeacherDayPeriods(auth.data, tx, teacherId, isoDayOfWeek(date));
    const sessions = await listSessions(auth.data, tx, { from: date, to: date }, 50);
    const counts = await countMarksBySession(
      auth.data,
      tx,
      sessions.map((session) => session.id),
    );

    const bySlot = new Map(
      sessions.filter((session) => session.timetableSlotId).map((s) => [s.timetableSlotId, s]),
    );

    const policy = await loadMarkingPolicy(auth.data, tx);

    const periods: TodayPeriod[] = slots.map((slot) => {
      const session = bySlot.get(slot.timetableSlotId);
      const marks = session ? (counts.get(session.id) ?? []) : [];
      return {
        slotId: slot.timetableSlotId,
        classId: slot.classId,
        className: slot.className,
        branchName: slot.branchName,
        subjectName: slot.subjectName,
        periodNumber: slot.periodNumber,
        startTime: slot.startTime.slice(0, 5),
        endTime: slot.endTime.slice(0, 5),
        sessionId: session?.id ?? null,
        markedCount: marks.reduce((total, mark) => total + mark.total, 0),
        cancelled: session?.status === "cancelled",
      };
    });

    return ok({
      date,
      periods,
      blockedBy: canMarkAttendance({
        role: "teacher",
        sessionDate: date,
        today: date,
        ...policy,
      }),
    });
  });
}

/** Resolves a timetable slot to the register it opens, for `/teacher/attendance/[slotId]`. */
export async function resolveSlotForMarking(
  slotId: string,
): Promise<Result<{ classId: string; periodNumber: number; sessionDate: string }>> {
  const auth = await requirePermission("attendance.mark");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const slot = await findSlotContext(auth.data, tx, slotId);
    // RLS already hides other teachers' slots; this makes the intent explicit rather
    // than relying on the policy alone for an authorisation decision in the app.
    if (!slot) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (auth.data.teacherId && slot.teacherId !== auth.data.teacherId) {
      return err("NOT_FOUND", ar.errors.NOT_FOUND);
    }

    return ok({
      classId: slot.classId,
      periodNumber: slot.periodNumber,
      // A teacher marks today, and only today (rule 10.5) — the date is not theirs
      // to choose, so it never comes from the URL.
      sessionDate: todayInCairo(),
    });
  });
}
