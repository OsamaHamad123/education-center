import { requirePermission } from "@/shared/actions/create-action";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { isIsoDate, isoDayOfWeek, nowTimeInCairo, todayInCairo } from "@/shared/lib/time";
import { canMarkAttendance, type MarkingViolation } from "../../domain/edit-window";
import { rosterFor, summarize, type AttendanceStatus } from "../../domain/roster";
import {
  countMarksBySession,
  findClassRef,
  listClassOptions,
  listDayPeriods,
  listEnrollmentPeriods,
  listMarks,
  listSessionsForDay,
  listStudentsByIds,
  type ClassRef,
  type RosterRow,
} from "../../infrastructure/attendance.repository";
import { loadMarkingPolicy } from "./marking-policy";

/**
 * The attendance screen (PROJECT_PLAN 10.5): branch → date → class → the periods of
 * that day, each showing whether it has been marked.
 *
 * The period list comes from the TIMETABLE, but a session that already exists wins:
 * it may have been given a substitute, cancelled, or added as an extra with no slot
 * at all, and what actually happened is what the screen must show.
 */

export type BoardPeriod = {
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectName: string;
  teacherName: string;
  /** Null until the first save — sessions are created lazily. */
  sessionId: string | null;
  status: "unmarked" | "marked" | "cancelled";
  markedCount: number;
  absentCount: number;
  isExtra: boolean;
  cancelReason: string | null;
};

export type AttendanceBoard = {
  classRef: ClassRef;
  classes: { id: string; name: string }[];
  sessionDate: string;
  today: string;
  periods: BoardPeriod[];
  /**
   * The period happening as this was rendered, or null.
   *
   * Computed here rather than in the component: the board is a client component, and a
   * clock read during hydration can disagree with the one read during the server render.
   * Null on any day but today, where "now" says nothing about the timetable.
   */
  nowPeriodNumber: number | null;
  rosterSize: number;
  /** Null when this viewer may write on this day; otherwise why not. */
  blockedBy: MarkingViolation | null;
};

export async function listAttendanceClasses(): Promise<Result<{ id: string; name: string }[]>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const branchId = auth.data.branchId;
  const rows = await withTenant(auth.data, (tx) => listClassOptions(auth.data, tx, branchId));
  return ok(rows);
}

export async function getAttendanceBoard(input: {
  classId: string;
  sessionDate?: string | undefined;
}): Promise<Result<AttendanceBoard>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;
  const branchId = auth.data.branchId;
  if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  // The board is a read-only overview, so an unusable date behaves like an absent one
  // and it opens on today (docs/AUDIT-2026-09.md, finding 1). `?date=not-a-date` used
  // to reach `isoDayOfWeek`, which throws before a query is even built.
  //
  // `/attendance/mark` deliberately does NOT do this: see the note there.
  const sessionDate = isIsoDate(input.sessionDate) ? input.sessionDate : todayInCairo();

  return withTenant(auth.data, async (tx) => {
    const classRef = await findClassRef(auth.data, tx, input.classId);
    // A class in another branch does not exist as far as this request is concerned.
    if (!classRef) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const today = todayInCairo();
    const policy = await loadMarkingPolicy(auth.data, tx);

    const [slots, sessions, enrollments] = await Promise.all([
      listDayPeriods(auth.data, tx, input.classId, isoDayOfWeek(sessionDate)),
      listSessionsForDay(auth.data, tx, input.classId, sessionDate),
      listEnrollmentPeriods(auth.data, tx, input.classId),
    ]);

    const counts = await countMarksBySession(
      auth.data,
      tx,
      sessions.map((session) => session.id),
    );

    const byPeriod = new Map(sessions.map((session) => [session.periodNumber, session]));
    const periods: BoardPeriod[] = [];

    for (const slot of slots) {
      const session = byPeriod.get(slot.periodNumber);
      periods.push(toBoardPeriod(slot, session, counts));
      byPeriod.delete(slot.periodNumber);
    }

    // Anything left is an extra session, or a period whose slot has since been
    // cleared from the timetable. Either way it happened, so it belongs on the day.
    for (const session of byPeriod.values()) {
      periods.push(toBoardPeriod(null, session, counts));
    }
    periods.sort((a, b) => a.periodNumber - b.periodNumber);

    return ok({
      classRef,
      classes: await listClassOptions(auth.data, tx, branchId),
      sessionDate,
      today,
      periods,
      nowPeriodNumber: sessionDate === today ? periodAt(periods, nowTimeInCairo()) : null,
      rosterSize: rosterFor(enrollments, input.classId, sessionDate).size,
      blockedBy: canMarkAttendance({
        role: auth.data.role,
        sessionDate,
        today,
        ...policy,
      }),
    });
  });
}

export type RosterEntry = RosterRow & {
  status: AttendanceStatus;
  notes: string | null;
};

export type AttendanceSheet = {
  classRef: ClassRef;
  sessionDate: string;
  periodNumber: number;
  subjectName: string;
  teacherName: string;
  startTime: string;
  endTime: string;
  sessionId: string | null;
  cancelled: boolean;
  students: RosterEntry[];
  summary: ReturnType<typeof summarize>;
  /** Who last saved this register, and when. Null before the first save. */
  savedBy: string | null;
  savedAt: Date | null;
  blockedBy: MarkingViolation | null;
};

/** One period's register: who should be there, and what is already recorded. */
export async function getAttendanceSheet(input: {
  classId: string;
  sessionDate: string;
  periodNumber: number;
}): Promise<Result<AttendanceSheet>> {
  const auth = await requirePermission("attendance.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const classRef = await findClassRef(auth.data, tx, input.classId);
    if (!classRef) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const resolved = await resolvePeriod(auth.data, tx, input);
    if (!resolved.ok) return resolved;
    const { period, session } = resolved.data;

    const enrollments = await listEnrollmentPeriods(auth.data, tx, input.classId);
    const roster = rosterFor(enrollments, input.classId, input.sessionDate);
    const rows = await listStudentsByIds(auth.data, tx, [...roster]);

    const marks = session ? await listMarks(auth.data, tx, session.id) : [];
    const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]));

    const studentsOnSheet: RosterEntry[] = rows.map((row) => {
      const mark = byStudent.get(row.studentId);
      return {
        ...row,
        // Unmarked students show as present: that is the default the save writes too,
        // so the screen never disagrees with what a tap on حفظ would store.
        status: mark?.status ?? "present",
        notes: mark?.notes ?? null,
      };
    });

    const latest = marks.reduce<(typeof marks)[number] | null>(
      (newest, mark) => (!newest || mark.markedAt > newest.markedAt ? mark : newest),
      null,
    );

    const policy = await loadMarkingPolicy(auth.data, tx);

    return ok({
      classRef,
      sessionDate: input.sessionDate,
      periodNumber: period.periodNumber,
      subjectName: period.subjectName,
      teacherName: period.teacherName,
      startTime: period.startTime.slice(0, 5),
      endTime: period.endTime.slice(0, 5),
      sessionId: session?.id ?? null,
      cancelled: session?.status === "cancelled",
      students: studentsOnSheet,
      summary: summarize(studentsOnSheet.map((student) => student.status)),
      savedBy: latest?.markedByName ?? null,
      savedAt: latest?.markedAt ?? null,
      blockedBy: canMarkAttendance({
        role: auth.data.role,
        sessionDate: input.sessionDate,
        today: todayInCairo(),
        ...policy,
      }),
    });
  });
}

/**
 * A period is whatever the session says it was, falling back to the weekly plan.
 * Once a session exists it is the record of what happened — including a substitute
 * teacher, which the timetable knows nothing about.
 */
async function resolvePeriod(
  ctx: TenantContext,
  tx: Tx,
  input: { classId: string; sessionDate: string; periodNumber: number },
) {
  const sessions = await listSessionsForDay(ctx, tx, input.classId, input.sessionDate);
  const session = sessions.find((row) => row.periodNumber === input.periodNumber) ?? null;
  if (session) {
    return ok({
      session,
      period: {
        periodNumber: session.periodNumber,
        subjectName: session.subjectName,
        teacherName: session.teacherName,
        startTime: session.startTime,
        endTime: session.endTime,
      },
    });
  }

  const slots = await listDayPeriods(ctx, tx, input.classId, isoDayOfWeek(input.sessionDate));
  const slot = slots.find((row) => row.periodNumber === input.periodNumber);
  if (!slot) return err("NOT_FOUND", ar.attendance.noSuchPeriod);

  return ok({
    session: null,
    period: {
      periodNumber: slot.periodNumber,
      subjectName: slot.subjectName,
      teacherName: slot.teacherName,
      startTime: slot.startTime,
      endTime: slot.endTime,
    },
  });
}

function toBoardPeriod(
  slot: Awaited<ReturnType<typeof listDayPeriods>>[number] | null,
  session: Awaited<ReturnType<typeof listSessionsForDay>>[number] | undefined,
  counts: Awaited<ReturnType<typeof countMarksBySession>>,
): BoardPeriod {
  const marks = session ? (counts.get(session.id) ?? []) : [];
  const markedCount = marks.reduce((total, mark) => total + mark.total, 0);
  const absentCount = marks.find((mark) => mark.status === "absent")?.total ?? 0;

  return {
    periodNumber: session?.periodNumber ?? slot?.periodNumber ?? 0,
    startTime: (session?.startTime ?? slot?.startTime ?? "").slice(0, 5),
    endTime: (session?.endTime ?? slot?.endTime ?? "").slice(0, 5),
    subjectName: session?.subjectName ?? slot?.subjectName ?? "",
    teacherName: session?.teacherName ?? slot?.teacherName ?? "",
    sessionId: session?.id ?? null,
    status: session ? (session.status === "cancelled" ? "cancelled" : "marked") : "unmarked",
    markedCount,
    absentCount,
    isExtra: session?.isExtra ?? false,
    cancelReason: session?.cancelReason ?? null,
  };
}

/** The period a time falls inside, if any. */
function periodAt(periods: BoardPeriod[], time: string): number | null {
  return periods.find((period) => period.startTime <= time && time < period.endTime)?.periodNumber ?? null;
}
