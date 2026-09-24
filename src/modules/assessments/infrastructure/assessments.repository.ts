import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  assessments,
  assessmentScores,
  branches,
  classes,
  students,
  studentEnrollments,
  subjects,
  teachers,
  timetableSlots,
  type Assessment,
  type AssessmentKind,
} from "@/shared/db/schema";

/**
 * Reading and writing marks (`drizzle/0021`).
 *
 * Every function takes `TenantContext` first and none of them filters by branch or by
 * teacher: RLS does that. A teacher's query returns their own assessments because the
 * policy admits only those, and a filter written here would be a second answer to a
 * question the database has already answered.
 */

export type AssessmentRow = {
  id: string;
  branchId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  name: string;
  kind: AssessmentKind;
  assessedOn: string;
  maxScoreHundredths: number;
  publishedAt: Date | null;
  isActive: boolean;
};

const assessmentColumns = {
  id: assessments.id,
  branchId: assessments.branchId,
  classId: assessments.classId,
  className: classes.name,
  subjectId: assessments.subjectId,
  subjectName: subjects.name,
  teacherId: assessments.teacherId,
  teacherName: teachers.fullName,
  name: assessments.name,
  kind: assessments.kind,
  assessedOn: assessments.assessedOn,
  maxScoreHundredths: assessments.maxScoreHundredths,
  publishedAt: assessments.publishedAt,
  isActive: assessments.isActive,
};

function assessmentQuery(tx: Tx) {
  return tx
    .select(assessmentColumns)
    .from(assessments)
    .innerJoin(classes, eq(classes.id, assessments.classId))
    .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
    .innerJoin(teachers, eq(teachers.id, assessments.teacherId));
}

export type AssessmentFilters = {
  from: string;
  to: string;
  classId?: string | undefined;
  subjectId?: string | undefined;
  /** Only what parents can see, or everything the viewer may read. */
  publishedOnly?: boolean | undefined;
};

export async function listAssessments(
  _ctx: TenantContext,
  tx: Tx,
  filters: AssessmentFilters,
  limit: number,
): Promise<AssessmentRow[]> {
  const where = [
    eq(assessments.isActive, true),
    gte(assessments.assessedOn, filters.from),
    lte(assessments.assessedOn, filters.to),
  ];
  if (filters.classId) where.push(eq(assessments.classId, filters.classId));
  if (filters.subjectId) where.push(eq(assessments.subjectId, filters.subjectId));
  if (filters.publishedOnly) where.push(isNotNull(assessments.publishedAt));

  return assessmentQuery(tx)
    .where(and(...where))
    .orderBy(desc(assessments.assessedOn), asc(subjects.name))
    .limit(limit);
}

export async function findAssessmentById(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
): Promise<AssessmentRow | null> {
  const [row] = await assessmentQuery(tx).where(eq(assessments.id, id)).limit(1);
  return row ?? null;
}

export async function insertAssessment(
  ctx: TenantContext,
  tx: Tx,
  values: {
    branchId: string;
    classId: string;
    subjectId: string;
    teacherId: string;
    name: string;
    kind: AssessmentKind;
    assessedOn: string;
    maxScoreHundredths: number;
  },
): Promise<Assessment> {
  const [row] = await tx
    .insert(assessments)
    .values({ ...values, createdBy: ctx.userId })
    .returning();
  if (!row) throw new Error("insertAssessment returned no row");
  return row;
}

export async function updateAssessment(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    name: string;
    kind: AssessmentKind;
    assessedOn: string;
    maxScoreHundredths: number;
    publishedAt: Date | null;
    isActive: boolean;
  }>,
): Promise<Assessment | null> {
  const [row] = await tx
    .update(assessments)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(assessments.id, id))
    .returning();
  return row ?? null;
}

// --- the marks -----------------------------------------------------------------

export type ScoreRow = {
  studentId: string;
  scoreHundredths: number | null;
  didNotSit: boolean;
  maxScoreHundredths: number;
  notes: string | null;
};

export async function listScores(_ctx: TenantContext, tx: Tx, assessmentId: string): Promise<ScoreRow[]> {
  return tx
    .select({
      studentId: assessmentScores.studentId,
      scoreHundredths: assessmentScores.scoreHundredths,
      didNotSit: assessmentScores.didNotSit,
      maxScoreHundredths: assessmentScores.maxScoreHundredths,
      notes: assessmentScores.notes,
    })
    .from(assessmentScores)
    .where(eq(assessmentScores.assessmentId, assessmentId));
}

/** How many students already have a row — what `checkPublish` needs and nothing more. */
export async function countScores(_ctx: TenantContext, tx: Tx, assessmentId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(assessmentScores)
    .where(eq(assessmentScores.assessmentId, assessmentId));
  return row?.count ?? 0;
}

export async function upsertScores(
  ctx: TenantContext,
  tx: Tx,
  assessmentId: string,
  branchId: string,
  maxScoreHundredths: number,
  rows: readonly {
    studentId: string;
    scoreHundredths: number | null;
    didNotSit: boolean;
    notes: string | null;
  }[],
): Promise<number> {
  if (rows.length === 0) return 0;

  // One statement, so a sheet of forty marks is one round trip and one lock — the
  // same reason `upsertMarks` batches the register.
  const written = await tx
    .insert(assessmentScores)
    .values(
      rows.map((row) => ({
        assessmentId,
        branchId,
        studentId: row.studentId,
        scoreHundredths: row.scoreHundredths,
        didNotSit: row.didNotSit,
        // The total is snapshotted onto every row as it is written, not read back
        // from the assessment later.
        maxScoreHundredths,
        notes: row.notes,
        markedBy: ctx.userId,
      })),
    )
    .onConflictDoUpdate({
      target: [assessmentScores.assessmentId, assessmentScores.studentId],
      set: {
        scoreHundredths: sql`excluded.score_hundredths`,
        didNotSit: sql`excluded.did_not_sit`,
        maxScoreHundredths: sql`excluded.max_score_hundredths`,
        notes: sql`excluded.notes`,
        markedBy: sql`excluded.marked_by`,
        markedAt: new Date(),
      },
    })
    .returning({ id: assessmentScores.id });

  return written.length;
}

// --- rosters and pickers --------------------------------------------------------

export type RosterStudent = { studentId: string; studentCode: string; fullName: string };

/**
 * Who belongs on this assessment's sheet.
 *
 * The enrolment that covers the DAY THE EXAM WAS SAT, not today's class list — a
 * student who moved class in October must still appear on September's paper, and must
 * not appear on a paper for a class they had already left. The same rule the register
 * follows (`attendance/domain/roster.ts`).
 */
export async function listRosterFor(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
  onDate: string,
): Promise<RosterStudent[]> {
  return tx
    .selectDistinct({
      studentId: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
    })
    .from(studentEnrollments)
    .innerJoin(students, eq(students.id, studentEnrollments.studentId))
    .where(
      and(
        eq(studentEnrollments.classId, classId),
        lte(studentEnrollments.startDate, onDate),
        sql`(${studentEnrollments.endDate} is null or ${studentEnrollments.endDate} >= ${onDate})`,
      ),
    )
    .orderBy(asc(students.fullName));
}

/** Classes the viewer may create an assessment for, in the branch they are in. */
export async function listAssessmentClasses(
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

/** Only the classes a TEACHER actually teaches — what their own screen offers. */
export async function listTaughtClasses(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<{ id: string; name: string }[]> {
  return tx
    .selectDistinct({ id: classes.id, name: classes.name })
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.isActive, true)))
    .orderBy(asc(classes.name));
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

export async function listTeacherOptions(
  _ctx: TenantContext,
  tx: Tx,
): Promise<{ id: string; fullName: string }[]> {
  return tx
    .selectDistinct({ id: teachers.id, fullName: teachers.fullName })
    .from(teachers)
    .orderBy(asc(teachers.fullName));
}

/** The branch a class belongs to — never taken from the client for a branch admin. */
export async function findClassBranch(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
): Promise<{ id: string; branchId: string; name: string } | null> {
  const [row] = await tx
    .select({ id: classes.id, branchId: classes.branchId, name: classes.name })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.isActive, true)))
    .limit(1);
  return row ?? null;
}

// --- one student's marks, for their profile -------------------------------------

export type StudentMarkRow = {
  assessmentId: string;
  name: string;
  kind: AssessmentKind;
  assessedOn: string;
  subjectName: string;
  className: string;
  branchName: string | null;
  scoreHundredths: number | null;
  didNotSit: boolean;
  maxScoreHundredths: number;
  publishedAt: Date | null;
};

export async function listStudentMarks(
  _ctx: TenantContext,
  tx: Tx,
  studentId: string,
  limit: number,
): Promise<StudentMarkRow[]> {
  return tx
    .select({
      assessmentId: assessments.id,
      name: assessments.name,
      kind: assessments.kind,
      assessedOn: assessments.assessedOn,
      subjectName: subjects.name,
      className: classes.name,
      branchName: branches.name,
      scoreHundredths: assessmentScores.scoreHundredths,
      didNotSit: assessmentScores.didNotSit,
      maxScoreHundredths: assessmentScores.maxScoreHundredths,
      publishedAt: assessments.publishedAt,
    })
    .from(assessmentScores)
    .innerJoin(assessments, eq(assessments.id, assessmentScores.assessmentId))
    .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
    .innerJoin(classes, eq(classes.id, assessments.classId))
    .leftJoin(branches, eq(branches.id, assessments.branchId))
    .where(and(eq(assessmentScores.studentId, studentId), eq(assessments.isActive, true)))
    .orderBy(desc(assessments.assessedOn), asc(subjects.name))
    .limit(limit);
}

/** Names for a sheet, once the roster has decided who is on it. */
export async function listStudentsByIds(
  _ctx: TenantContext,
  tx: Tx,
  ids: readonly string[],
): Promise<RosterStudent[]> {
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
