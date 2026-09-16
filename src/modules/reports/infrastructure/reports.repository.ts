import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  attendanceRecords,
  branches,
  classes,
  classSessions,
  students,
  timetableSlots,
  type AttendanceStatus,
} from "@/shared/db/schema";
import { ZERO_COUNTS, type StatusCounts } from "../domain/attendance-rates";

/**
 * Reports aggregate in SQL (PROJECT_PLAN Phase 8 prompt). A term's attendance for one
 * branch is hundreds of thousands of rows; the percentages themselves are computed by
 * the pure functions in `domain/attendance-rates.ts` from the counts returned here,
 * so the arithmetic stays tested and the database only does what it is good at.
 *
 * Every query joins `class_sessions` and excludes cancelled ones: a lesson that never
 * happened must not count against a student's attendance.
 */

export type DateRange = { from: string; to: string };

function inRange(range: DateRange) {
  return and(
    gte(classSessions.sessionDate, range.from),
    lte(classSessions.sessionDate, range.to),
    eq(classSessions.status, "completed"),
  );
}

// --- per student --------------------------------------------------------------

export type StudentAttendanceRow = {
  studentId: string;
  studentCode: string;
  fullName: string;
  classId: string;
  className: string;
  parentPhone: string;
  counts: StatusCounts;
};

/** Status counts per student across a date range, for one class or a whole branch. */
export async function countByStudent(
  _ctx: TenantContext,
  tx: Tx,
  range: DateRange,
  classId?: string,
): Promise<StudentAttendanceRow[]> {
  const where = [inRange(range)];
  if (classId) where.push(eq(classSessions.classId, classId));

  const rows = await tx
    .select({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      classId: classes.id,
      className: classes.name,
      parentPhone: students.parentPhone,
      status: attendanceRecords.status,
      total: sql<number>`count(*)::int`,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .innerJoin(students, eq(students.id, attendanceRecords.studentId))
    .innerJoin(classes, eq(classes.id, classSessions.classId))
    .where(and(...where))
    .groupBy(
      students.id,
      students.studentCode,
      students.fullName,
      classes.id,
      classes.name,
      students.parentPhone,
      attendanceRecords.status,
    );

  const byStudent = new Map<string, StudentAttendanceRow>();
  for (const row of rows) {
    const entry =
      byStudent.get(row.studentId) ??
      ({
        studentId: row.studentId,
        studentCode: row.studentCode,
        fullName: row.fullName,
        classId: row.classId,
        className: row.className,
        parentPhone: row.parentPhone,
        counts: { ...ZERO_COUNTS },
      } satisfies StudentAttendanceRow);

    entry.counts[row.status] += row.total;
    byStudent.set(row.studentId, entry);
  }

  return [...byStudent.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
}

// --- the class matrix ---------------------------------------------------------

export type MatrixCell = {
  studentId: string;
  sessionDate: string;
  status: AttendanceStatus;
};

export type MatrixSessionColumn = {
  sessionDate: string;
  periodNumber: number;
  subjectName: string;
};

/** Students × dates for one class (rule 10.7), as flat cells the view pivots. */
export async function classMatrix(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
  range: DateRange,
): Promise<{ cells: MatrixCell[]; columns: MatrixSessionColumn[] }> {
  const sessions = await tx
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      periodNumber: classSessions.periodNumber,
      subjectName: classSessions.subjectName,
    })
    .from(classSessions)
    .where(and(eq(classSessions.classId, classId), inRange(range)))
    .orderBy(asc(classSessions.sessionDate), asc(classSessions.periodNumber));

  if (sessions.length === 0) return { cells: [], columns: [] };

  const cells = await tx
    .select({
      studentId: attendanceRecords.studentId,
      sessionDate: classSessions.sessionDate,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .where(
      inArray(
        attendanceRecords.sessionId,
        sessions.map((session) => session.id),
      ),
    );

  return { cells, columns: sessions };
}

// --- the branch dashboard -----------------------------------------------------

export type DayPulse = {
  sessionsPlanned: number;
  sessionsDone: number;
  sessionsCancelled: number;
  counts: StatusCounts;
};

/**
 * Today at a glance (rule 10.7). "Planned" is how many periods the weekly timetable
 * holds for today; "done" is how many actually have a register. The two come from
 * different tables on purpose — the gap between them is the number the branch admin
 * is looking at this screen to find.
 */
export async function todayPulse(
  _ctx: TenantContext,
  tx: Tx,
  date: string,
  dayOfWeek: number,
): Promise<DayPulse> {
  const [planned] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(timetableSlots)
    .where(and(eq(timetableSlots.dayOfWeek, dayOfWeek), eq(timetableSlots.isActive, true)));

  const sessions = await tx
    .select({ status: classSessions.status, total: sql<number>`count(*)::int` })
    .from(classSessions)
    .where(eq(classSessions.sessionDate, date))
    .groupBy(classSessions.status);

  const marks = await tx
    .select({ status: attendanceRecords.status, total: sql<number>`count(*)::int` })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .where(and(eq(classSessions.sessionDate, date), eq(classSessions.status, "completed")))
    .groupBy(attendanceRecords.status);

  const counts = { ...ZERO_COUNTS };
  for (const mark of marks) counts[mark.status] += mark.total;

  return {
    sessionsPlanned: planned?.total ?? 0,
    sessionsDone: sessions.find((row) => row.status === "completed")?.total ?? 0,
    sessionsCancelled: sessions.find((row) => row.status === "cancelled")?.total ?? 0,
    counts,
  };
}

// --- the super admin's branch comparison --------------------------------------

export type BranchComparisonRow = {
  branchId: string;
  branchName: string;
  sessions: number;
  payrollPiasters: number;
  counts: StatusCounts;
};

/** One row per branch: sessions, payroll and attendance over a range (rule 10.7). */
export async function compareBranches(
  _ctx: TenantContext,
  tx: Tx,
  range: DateRange,
): Promise<BranchComparisonRow[]> {
  const sessionTotals = await tx
    .select({
      branchId: classSessions.branchId,
      branchName: branches.name,
      sessions: sql<number>`count(*)::int`,
      payrollPiasters: sql<number>`coalesce(sum(${classSessions.rateAppliedPiasters}), 0)::int`,
    })
    .from(classSessions)
    .innerJoin(branches, eq(branches.id, classSessions.branchId))
    .where(inRange(range))
    .groupBy(classSessions.branchId, branches.name)
    .orderBy(asc(branches.name));

  const markTotals = await tx
    .select({
      branchId: classSessions.branchId,
      status: attendanceRecords.status,
      total: sql<number>`count(*)::int`,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .where(inRange(range))
    .groupBy(classSessions.branchId, attendanceRecords.status);

  return sessionTotals.map((row) => {
    const counts = { ...ZERO_COUNTS };
    for (const mark of markTotals.filter((m) => m.branchId === row.branchId)) {
      counts[mark.status] += mark.total;
    }
    return { ...row, counts };
  });
}

// --- shared lookups -----------------------------------------------------------

export async function listReportClasses(
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

export type AbsenceDate = { sessionDate: string; status: AttendanceStatus; notes: string | null };

/** The days one student missed, for their profile and the public lookup. */
export async function listAbsenceDates(
  _ctx: TenantContext,
  tx: Tx,
  studentId: string,
  range: DateRange,
): Promise<AbsenceDate[]> {
  return tx
    .select({
      sessionDate: classSessions.sessionDate,
      status: attendanceRecords.status,
      notes: attendanceRecords.notes,
    })
    .from(attendanceRecords)
    .innerJoin(classSessions, eq(classSessions.id, attendanceRecords.sessionId))
    .where(
      and(
        eq(attendanceRecords.studentId, studentId),
        inRange(range),
        inArray(attendanceRecords.status, ["absent", "late"]),
      ),
    )
    .orderBy(desc(classSessions.sessionDate));
}
