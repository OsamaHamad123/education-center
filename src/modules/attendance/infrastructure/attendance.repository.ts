import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  attendanceRecords,
  branches,
  classes,
  classSessions,
  students,
  studentEnrollments,
  subjects,
  teacherBranches,
  teachers,
  timetableSlots,
  user,
  type AttendanceStatus,
  type ClassSession,
  type SessionStatus,
  type Track,
} from "@/shared/db/schema";
import type { EnrollmentPeriod } from "../domain/roster";

/**
 * Every function takes a TenantContext and runs inside `withTenant`, so RLS decides
 * what is reachable. A teacher reaching these sees only their own sessions — that is
 * the policy's doing, not a filter written here.
 */

// --- the day's periods -------------------------------------------------------

export type DayPeriod = {
  timetableSlotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
};

/** The weekly plan for one class on one weekday — the spine of the marking screen. */
export async function listDayPeriods(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
  dayOfWeek: number,
): Promise<DayPeriod[]> {
  return tx
    .select({
      timetableSlotId: timetableSlots.id,
      periodNumber: timetableSlots.periodNumber,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      subjectId: timetableSlots.subjectId,
      subjectName: subjects.name,
      teacherId: timetableSlots.teacherId,
      teacherName: teachers.fullName,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(teachers, eq(teachers.id, timetableSlots.teacherId))
    .where(
      and(
        eq(timetableSlots.classId, classId),
        eq(timetableSlots.dayOfWeek, dayOfWeek),
        eq(timetableSlots.isActive, true),
      ),
    )
    .orderBy(asc(timetableSlots.periodNumber));
}

/**
 * The signed-in teacher's periods on one weekday, across every branch they work in.
 * RLS narrows `timetable_slots` to their own rows, so no teacher filter is written
 * here beyond the one that makes the intent obvious.
 */
export async function listTeacherDayPeriods(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
  dayOfWeek: number,
): Promise<(DayPeriod & { classId: string; className: string; branchName: string | null })[]> {
  return tx
    .select({
      timetableSlotId: timetableSlots.id,
      periodNumber: timetableSlots.periodNumber,
      startTime: timetableSlots.startTime,
      endTime: timetableSlots.endTime,
      subjectId: timetableSlots.subjectId,
      subjectName: subjects.name,
      teacherId: timetableSlots.teacherId,
      teacherName: teachers.fullName,
      classId: timetableSlots.classId,
      className: classes.name,
      branchName: branches.name,
    })
    .from(timetableSlots)
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(teachers, eq(teachers.id, timetableSlots.teacherId))
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .leftJoin(branches, eq(branches.id, timetableSlots.branchId))
    .where(
      and(
        eq(timetableSlots.teacherId, teacherId),
        eq(timetableSlots.dayOfWeek, dayOfWeek),
        eq(timetableSlots.isActive, true),
      ),
    )
    .orderBy(asc(timetableSlots.startTime));
}

/** Resolves one slot to the class and period it belongs to. */
export async function findSlotContext(
  _ctx: TenantContext,
  tx: Tx,
  slotId: string,
): Promise<{ classId: string; periodNumber: number; teacherId: string } | null> {
  const [row] = await tx
    .select({
      classId: timetableSlots.classId,
      periodNumber: timetableSlots.periodNumber,
      teacherId: timetableSlots.teacherId,
    })
    .from(timetableSlots)
    .where(eq(timetableSlots.id, slotId))
    .limit(1);
  return row ?? null;
}

// --- sessions ----------------------------------------------------------------

export type SessionRow = {
  id: string;
  branchId: string;
  branchName: string | null;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  timetableSlotId: string | null;
  subjectName: string;
  sessionDate: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  trackApplied: Track;
  rateAppliedPiasters: number;
  status: SessionStatus;
  cancelReason: string | null;
  isExtra: boolean;
  /** Whose lesson it was before it was handed over (`drizzle/0020`). */
  substitutedFromTeacherId: string | null;
  substitutedFromName: string | null;
  /** The missed lesson this extra one makes up for (`drizzle/0020`). */
  makesUpSessionId: string | null;
};

/**
 * The original teacher is a SECOND join to `teachers`, aliased — the row already
 * joins that table for the person teaching it now, and both names are wanted on the
 * same line: "حصة أحمد، غطّاها خالد".
 */
const originTeacher = alias(teachers, "origin_teacher");

const sessionColumns = {
  id: classSessions.id,
  branchId: classSessions.branchId,
  branchName: branches.name,
  classId: classSessions.classId,
  className: classes.name,
  teacherId: classSessions.teacherId,
  teacherName: teachers.fullName,
  timetableSlotId: classSessions.timetableSlotId,
  subjectName: classSessions.subjectName,
  sessionDate: classSessions.sessionDate,
  periodNumber: classSessions.periodNumber,
  startTime: classSessions.startTime,
  endTime: classSessions.endTime,
  trackApplied: classSessions.trackApplied,
  rateAppliedPiasters: classSessions.rateAppliedPiasters,
  status: classSessions.status,
  cancelReason: classSessions.cancelReason,
  isExtra: classSessions.isExtra,
  substitutedFromTeacherId: classSessions.substitutedFromTeacherId,
  substitutedFromName: originTeacher.fullName,
  makesUpSessionId: classSessions.makesUpSessionId,
};

function sessionQuery(tx: Tx) {
  return tx
    .select(sessionColumns)
    .from(classSessions)
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .innerJoin(teachers, eq(teachers.id, classSessions.teacherId))
    .leftJoin(originTeacher, eq(originTeacher.id, classSessions.substitutedFromTeacherId))
    .leftJoin(branches, eq(branches.id, classSessions.branchId));
}

export async function listSessionsForDay(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
  sessionDate: string,
): Promise<SessionRow[]> {
  return sessionQuery(tx)
    .where(and(eq(classSessions.classId, classId), eq(classSessions.sessionDate, sessionDate)))
    .orderBy(asc(classSessions.periodNumber));
}

export async function findSessionById(_ctx: TenantContext, tx: Tx, id: string): Promise<SessionRow | null> {
  const [row] = await sessionQuery(tx).where(eq(classSessions.id, id)).limit(1);
  return row ?? null;
}

export type SessionFilters = {
  from: string;
  to: string;
  classId?: string | undefined;
  teacherId?: string | undefined;
  status?: SessionStatus | undefined;
};

export async function listSessions(
  _ctx: TenantContext,
  tx: Tx,
  filters: SessionFilters,
  limit: number,
): Promise<SessionRow[]> {
  const where = [gte(classSessions.sessionDate, filters.from), lte(classSessions.sessionDate, filters.to)];
  if (filters.classId) where.push(eq(classSessions.classId, filters.classId));
  if (filters.teacherId) where.push(eq(classSessions.teacherId, filters.teacherId));
  if (filters.status) where.push(eq(classSessions.status, filters.status));

  return sessionQuery(tx)
    .where(and(...where))
    .orderBy(desc(classSessions.sessionDate), asc(classSessions.periodNumber))
    .limit(limit);
}

export async function insertSession(
  ctx: TenantContext,
  tx: Tx,
  values: {
    branchId: string;
    classId: string;
    teacherId: string;
    timetableSlotId: string | null;
    subjectName: string;
    sessionDate: string;
    periodNumber: number;
    startTime: string;
    endTime: string;
    trackApplied: Track;
    rateAppliedPiasters: number;
    isExtra: boolean;
    /** Set only for a make-up, which is what keeps the pair one lesson's pay. */
    makesUpSessionId?: string | null;
  },
): Promise<ClassSession> {
  const [session] = await tx
    .insert(classSessions)
    .values({ ...values, createdBy: ctx.userId })
    .returning();
  if (!session) throw new Error("insertSession returned no row");
  return session;
}

export async function updateSession(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    teacherId: string;
    rateAppliedPiasters: number;
    status: SessionStatus;
    cancelReason: string | null;
    substitutedFromTeacherId: string | null;
  }>,
): Promise<ClassSession | null> {
  const [session] = await tx
    .update(classSessions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(classSessions.id, id))
    .returning();
  return session ?? null;
}

/**
 * The extra session that already makes up for this one, if there is one
 * (`drizzle/0020`).
 *
 * Read inside the caller's transaction so the answer is the one that is true when the
 * row is written. It is not the guarantee — the partial unique index is, and it is
 * what survives two clerks pressing save at once. This is here to turn that race into
 * an Arabic sentence for the one who loses it.
 */
export async function findMakeUpOf(
  _ctx: TenantContext,
  tx: Tx,
  sessionId: string,
): Promise<{ id: string; status: SessionStatus } | null> {
  const [row] = await tx
    .select({ id: classSessions.id, status: classSessions.status })
    .from(classSessions)
    .where(eq(classSessions.makesUpSessionId, sessionId))
    .limit(1);
  return row ?? null;
}

export type MakeUpCandidate = {
  id: string;
  sessionDate: string;
  periodNumber: number;
  subjectName: string;
  teacherName: string;
  cancelReason: string | null;
};

/**
 * Cancelled lessons of one class that nothing has made up for yet — what the make-up
 * dialog offers.
 *
 * Completed lessons are deliberately absent: offering one would invite the office to
 * record a make-up for a lesson that was actually taught, which is the double payment
 * from the other direction. If the office means to move a lesson that still stands,
 * the make-up cancels it first, and says so.
 */
export async function listMakeUpCandidates(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
  from: string,
  to: string,
): Promise<MakeUpCandidate[]> {
  const madeUp = alias(classSessions, "made_up");

  return tx
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      periodNumber: classSessions.periodNumber,
      subjectName: classSessions.subjectName,
      teacherName: teachers.fullName,
      cancelReason: classSessions.cancelReason,
    })
    .from(classSessions)
    .innerJoin(teachers, eq(teachers.id, classSessions.teacherId))
    .leftJoin(madeUp, eq(madeUp.makesUpSessionId, classSessions.id))
    .where(
      and(
        eq(classSessions.classId, classId),
        eq(classSessions.status, "cancelled"),
        gte(classSessions.sessionDate, from),
        lte(classSessions.sessionDate, to),
        sql`${madeUp.id} is null`,
      ),
    )
    .orderBy(desc(classSessions.sessionDate), asc(classSessions.periodNumber))
    .limit(50);
}

// --- the roster and its marks ------------------------------------------------

export type RosterRow = {
  studentId: string;
  studentCode: string;
  fullName: string;
};

/**
 * Enrolment PERIODS for one class, so the domain can decide who was there on the day.
 * Deliberately not filtered by date in SQL: `rosterFor` owns that rule and is tested.
 */
export async function listEnrollmentPeriods(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
): Promise<EnrollmentPeriod[]> {
  return tx
    .select({
      studentId: studentEnrollments.studentId,
      classId: studentEnrollments.classId,
      startDate: studentEnrollments.startDate,
      endDate: studentEnrollments.endDate,
    })
    .from(studentEnrollments)
    .where(eq(studentEnrollments.classId, classId));
}

/** Names and codes for a set of students, in a stable Arabic order. */
export async function listStudentsByIds(
  _ctx: TenantContext,
  tx: Tx,
  ids: readonly string[],
): Promise<RosterRow[]> {
  if (ids.length === 0) return [];
  return tx
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
    })
    .from(students)
    .where(inArray(students.id, [...ids]))
    .orderBy(asc(students.fullName));
}

export type MarkRow = {
  studentId: string;
  status: AttendanceStatus;
  notes: string | null;
  markedAt: Date;
  markedByName: string | null;
};

export async function listMarks(_ctx: TenantContext, tx: Tx, sessionId: string): Promise<MarkRow[]> {
  return tx
    .select({
      studentId: attendanceRecords.studentId,
      status: attendanceRecords.status,
      notes: attendanceRecords.notes,
      markedAt: attendanceRecords.markedAt,
      markedByName: user.name,
    })
    .from(attendanceRecords)
    .leftJoin(user, eq(user.id, attendanceRecords.markedBy))
    .where(eq(attendanceRecords.sessionId, sessionId));
}

/** Status counts per session, for the period list and the log. */
export async function countMarksBySession(
  _ctx: TenantContext,
  tx: Tx,
  sessionIds: readonly string[],
): Promise<Map<string, { status: AttendanceStatus; total: number }[]>> {
  const bySession = new Map<string, { status: AttendanceStatus; total: number }[]>();
  if (sessionIds.length === 0) return bySession;

  const rows = await tx
    .select({
      sessionId: attendanceRecords.sessionId,
      status: attendanceRecords.status,
      total: sql<number>`count(*)::int`,
    })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.sessionId, [...sessionIds]))
    .groupBy(attendanceRecords.sessionId, attendanceRecords.status);

  for (const row of rows) {
    const list = bySession.get(row.sessionId) ?? [];
    list.push({ status: row.status, total: row.total });
    bySession.set(row.sessionId, list);
  }
  return bySession;
}

/**
 * The save. One statement, `on conflict (session_id, student_id) do update`, which is
 * what makes tapping حفظ twice on a bad connection harmless (rule 10.5).
 */
export async function upsertMarks(
  ctx: TenantContext,
  tx: Tx,
  values: readonly {
    sessionId: string;
    branchId: string;
    studentId: string;
    status: AttendanceStatus;
    notes: string | null;
  }[],
): Promise<number> {
  if (values.length === 0) return 0;

  const rows = await tx
    .insert(attendanceRecords)
    .values(values.map((value) => ({ ...value, markedBy: ctx.userId })))
    .onConflictDoUpdate({
      target: [attendanceRecords.sessionId, attendanceRecords.studentId],
      set: {
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        markedBy: ctx.userId,
        markedAt: new Date(),
      },
    })
    .returning({ id: attendanceRecords.id });

  return rows.length;
}

// --- lookups the screen needs ------------------------------------------------

export type ClassRef = { id: string; name: string; branchId: string; track: Track };

export async function findClassRef(_ctx: TenantContext, tx: Tx, classId: string): Promise<ClassRef | null> {
  const [row] = await tx
    .select({ id: classes.id, name: classes.name, branchId: classes.branchId, track: classes.track })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return row ?? null;
}

export async function listClassOptions(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
): Promise<{ id: string; name: string }[]> {
  return tx
    .select({ id: classes.id, name: classes.name })
    .from(classes)
    .where(and(eq(classes.branchId, branchId), eq(classes.isActive, true)))
    .orderBy(asc(classes.name));
}

export type TeacherRates = { scientificPiasters: number; literaryPiasters: number };

/**
 * The teacher's rates, right now. Read once per session creation and frozen into the
 * row — never joined to at read time (rule 10.6).
 *
 * Returns null when the teacher is not linked to, or not active in, this branch: a
 * session must not be created for someone who does not teach there.
 */
export async function findTeacherRatesInBranch(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
  branchId: string,
): Promise<TeacherRates | null> {
  const [row] = await tx
    .select({
      scientificPiasters: teachers.ratePiastersScientific,
      literaryPiasters: teachers.ratePiastersLiterary,
    })
    .from(teachers)
    .innerJoin(teacherBranches, eq(teacherBranches.teacherId, teachers.id))
    .where(
      and(
        eq(teachers.id, teacherId),
        eq(teachers.status, "active"),
        eq(teacherBranches.branchId, branchId),
        eq(teacherBranches.isActive, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listTeacherOptions(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
): Promise<{ id: string; fullName: string }[]> {
  return tx
    .select({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .innerJoin(teacherBranches, eq(teacherBranches.teacherId, teachers.id))
    .where(
      and(
        eq(teacherBranches.branchId, branchId),
        eq(teacherBranches.isActive, true),
        eq(teachers.status, "active"),
      ),
    )
    .orderBy(asc(teachers.fullName));
}

export async function listSubjectOptions(
  _ctx: TenantContext,
  tx: Tx,
): Promise<{ id: string; name: string }[]> {
  return tx
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(eq(subjects.isActive, true))
    .orderBy(asc(subjects.name));
}

// --- absences without permission ----------------------------------------------

/**
 * Every period a student missed WITHOUT permission in a range
 * (`domain/absences.ts`).
 *
 * There is no role filter in this function and there must not be one. A teacher sees
 * their own lessons because `attendance_records_select` admits a teacher only to rows
 * whose session is theirs; a branch admin sees their branch because the same policy
 * admits their branch. The scoping is the database's, and a filter written here would
 * be a second answer to a question that already has one.
 *
 * Cancelled sessions are excluded: a lesson that did not run is not one a child
 * skipped, and the register kept for it is a record, not an accusation.
 */
export async function listUnexcusedAbsences(
  _ctx: TenantContext,
  tx: Tx,
  filters: { from: string; to: string; classId?: string | undefined },
  limit: number,
): Promise<
  {
    studentId: string;
    fullName: string;
    studentCode: string;
    classId: string;
    className: string;
    sessionId: string;
    sessionDate: string;
    periodNumber: number;
    subjectName: string;
    teacherName: string;
  }[]
> {
  const where = [
    eq(attendanceRecords.status, "absent"),
    eq(classSessions.status, "completed"),
    gte(classSessions.sessionDate, filters.from),
    lte(classSessions.sessionDate, filters.to),
  ];
  if (filters.classId) where.push(eq(classSessions.classId, filters.classId));

  return tx
    .select({
      studentId: students.id,
      fullName: students.fullName,
      studentCode: students.studentCode,
      classId: classSessions.classId,
      className: classes.name,
      sessionId: classSessions.id,
      sessionDate: classSessions.sessionDate,
      periodNumber: classSessions.periodNumber,
      subjectName: classSessions.subjectName,
      teacherName: teachers.fullName,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .innerJoin(students, eq(students.id, attendanceRecords.studentId))
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .innerJoin(teachers, eq(teachers.id, classSessions.teacherId))
    .where(and(...where))
    .orderBy(desc(classSessions.sessionDate), asc(classSessions.periodNumber))
    .limit(limit);
}

// --- the monthly register sheet ------------------------------------------------

export type RegisterColumn = {
  sessionId: string;
  sessionDate: string;
  periodNumber: number;
  subjectName: string;
  status: SessionStatus;
};

/**
 * The columns of the register sheet: one per SESSION, not one per day.
 *
 * `classMatrix` in the reports module folds a day into a single cell and shows the
 * worst status in it. That answers "which days did he miss"; the paper register the
 * centre actually keeps asks "which LESSONS did he miss", and a day with two periods
 * gets two columns on it (photographs, 2026-09-24).
 */
export async function listRegisterColumns(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
  from: string,
  to: string,
): Promise<RegisterColumn[]> {
  return tx
    .select({
      sessionId: classSessions.id,
      sessionDate: classSessions.sessionDate,
      periodNumber: classSessions.periodNumber,
      subjectName: classSessions.subjectName,
      status: classSessions.status,
    })
    .from(classSessions)
    .where(
      and(
        eq(classSessions.classId, classId),
        gte(classSessions.sessionDate, from),
        lte(classSessions.sessionDate, to),
      ),
    )
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.periodNumber));
}

/** The marks behind those columns, keyed by session so nothing is folded away. */
export async function listRegisterCells(
  _ctx: TenantContext,
  tx: Tx,
  sessionIds: readonly string[],
): Promise<{ studentId: string; sessionId: string; status: AttendanceStatus }[]> {
  if (sessionIds.length === 0) return [];
  return tx
    .select({
      studentId: attendanceRecords.studentId,
      sessionId: attendanceRecords.sessionId,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .where(inArray(attendanceRecords.sessionId, [...sessionIds]));
}
