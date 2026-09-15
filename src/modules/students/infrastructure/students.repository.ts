import { and, asc, count, desc, eq, exists, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  branches,
  classes,
  studentCodeCounters,
  studentEnrollments,
  students,
  type Student,
  type StudentEnrollment,
} from "@/shared/db/schema";

export type StudentListFilters = {
  search?: string | undefined;
  classId?: string | undefined;
  status: "active" | "archived";
  /** Students who were once in this branch but have since moved elsewhere (rule 10.3). */
  transferredOut?: boolean | undefined;
  page: number;
  pageSize: number;
};

export type StudentRow = {
  id: string;
  studentCode: string;
  fullName: string;
  parentPhone: string;
  status: Student["status"];
  branchId: string;
  branchName: string | null;
  classId: string;
  className: string | null;
  joinDate: string;
};

/**
 * The branch a super admin has selected is applied HERE, as an ordinary filter: RLS
 * deliberately no longer scopes their reads (see docs/PROGRESS.md). A branch admin is
 * narrowed by RLS anyway, and `ctx.branchId` is their own branch, so the same clause
 * is correct for both.
 */
function scopeToBranch(ctx: TenantContext): SQL | undefined {
  return ctx.branchId ? eq(students.branchId, ctx.branchId) : undefined;
}

function buildWhere(ctx: TenantContext, filters: StudentListFilters): SQL | undefined {
  const clauses: SQL[] = [eq(students.status, filters.status)];

  if (filters.transferredOut && ctx.branchId) {
    // Somewhere else now, but once enrolled here.
    clauses.push(ne(students.branchId, ctx.branchId));
    clauses.push(
      exists(
        // A correlated EXISTS rather than a join: a student may have several closed
        // enrollments here and a join would return them once per row.
        sql`select 1 from ${studentEnrollments} e
            where e.student_id = ${students.id} and e.branch_id = ${ctx.branchId}`,
      ),
    );
  } else {
    const scope = scopeToBranch(ctx);
    if (scope) clauses.push(scope);
  }

  if (filters.classId) clauses.push(eq(students.classId, filters.classId));

  if (filters.search) {
    const term = `%${filters.search}%`;
    const match = or(
      // pg_trgm makes this ILIKE an index scan rather than a table scan (7.5).
      ilike(students.fullName, term),
      ilike(students.studentCode, term),
      ilike(students.parentPhone, term),
    );
    if (match) clauses.push(match);
  }

  return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listStudents(
  ctx: TenantContext,
  tx: Tx,
  filters: StudentListFilters,
): Promise<{ rows: StudentRow[]; total: number }> {
  const where = buildWhere(ctx, filters);

  const rows = await tx
    .select({
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      parentPhone: students.parentPhone,
      status: students.status,
      branchId: students.branchId,
      branchName: branches.name,
      classId: students.classId,
      className: classes.name,
      joinDate: students.joinDate,
    })
    .from(students)
    .leftJoin(branches, eq(branches.id, students.branchId))
    .leftJoin(classes, eq(classes.id, students.classId))
    .where(where)
    .orderBy(asc(students.fullName))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [totals] = await tx.select({ total: count() }).from(students).where(where);
  return { rows, total: totals?.total ?? 0 };
}

export async function findStudentById(_ctx: TenantContext, tx: Tx, id: string): Promise<Student | null> {
  const [student] = await tx.select().from(students).where(eq(students.id, id)).limit(1);
  return student ?? null;
}

export async function findStudentByCode(_ctx: TenantContext, tx: Tx, code: string): Promise<Student | null> {
  const [student] = await tx.select().from(students).where(eq(students.studentCode, code)).limit(1);
  return student ?? null;
}

/** The open enrollment — the row that says where the student is right now. */
export async function findOpenEnrollment(
  _ctx: TenantContext,
  tx: Tx,
  studentId: string,
): Promise<StudentEnrollment | null> {
  const [row] = await tx
    .select()
    .from(studentEnrollments)
    .where(and(eq(studentEnrollments.studentId, studentId), sql`${studentEnrollments.endDate} is null`))
    .limit(1);
  return row ?? null;
}

export type EnrollmentHistoryRow = StudentEnrollment & {
  branchName: string | null;
  className: string | null;
};

export async function listEnrollmentHistory(
  _ctx: TenantContext,
  tx: Tx,
  studentId: string,
): Promise<EnrollmentHistoryRow[]> {
  return tx
    .select({
      id: studentEnrollments.id,
      studentId: studentEnrollments.studentId,
      branchId: studentEnrollments.branchId,
      classId: studentEnrollments.classId,
      startDate: studentEnrollments.startDate,
      endDate: studentEnrollments.endDate,
      endReason: studentEnrollments.endReason,
      note: studentEnrollments.note,
      createdBy: studentEnrollments.createdBy,
      createdAt: studentEnrollments.createdAt,
      branchName: branches.name,
      className: classes.name,
    })
    .from(studentEnrollments)
    .leftJoin(branches, eq(branches.id, studentEnrollments.branchId))
    .leftJoin(classes, eq(classes.id, studentEnrollments.classId))
    .where(eq(studentEnrollments.studentId, studentId))
    .orderBy(desc(studentEnrollments.startDate), desc(studentEnrollments.createdAt));
}

/** Candidates for the duplicate warning, scoped to one branch (rule 10.3). */
export async function findDuplicateCandidates(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  parentPhone: string,
): Promise<{ id: string; studentCode: string; fullName: string; parentPhone: string; className: string }[]> {
  const rows = await tx
    .select({
      id: students.id,
      studentCode: students.studentCode,
      fullName: students.fullName,
      parentPhone: students.parentPhone,
      className: classes.name,
    })
    .from(students)
    .leftJoin(classes, eq(classes.id, students.classId))
    .where(and(eq(students.branchId, branchId), eq(students.parentPhone, parentPhone)))
    .limit(20);

  return rows.map((row) => ({ ...row, className: row.className ?? "" }));
}

/**
 * Reserves the next sequence for a branch and year (PROJECT_PLAN 7.5).
 *
 * `FOR UPDATE` is the whole point: two people enrolling a student at the same moment
 * must not be handed the same code. The lock is held until the surrounding
 * transaction commits, which is also when the student row appears.
 */
export async function nextStudentSequence(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  year: number,
): Promise<number> {
  await tx.insert(studentCodeCounters).values({ branchId, year, lastValue: 0 }).onConflictDoNothing();

  const locked = await tx.execute(
    sql`select last_value from student_code_counters
        where branch_id = ${branchId} and year = ${year} for update`,
  );
  const current = Number((locked[0] as { last_value: number } | undefined)?.last_value ?? 0);
  const next = current + 1;

  await tx
    .update(studentCodeCounters)
    .set({ lastValue: next })
    .where(and(eq(studentCodeCounters.branchId, branchId), eq(studentCodeCounters.year, year)));

  return next;
}

export async function insertStudent(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    studentCode: string;
    fullName: string;
    studentPhone: string | null;
    studentWhatsapp: string | null;
    parentPhone: string;
    parentWhatsapp: string | null;
    nationalId: string | null;
    branchId: string;
    classId: string;
    joinDate: string;
  },
): Promise<Student> {
  const [student] = await tx.insert(students).values(values).returning();
  if (!student) throw new Error("insertStudent returned no row");
  return student;
}

export async function updateStudent(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    fullName: string;
    studentPhone: string | null;
    studentWhatsapp: string | null;
    parentPhone: string;
    parentWhatsapp: string | null;
    nationalId: string | null;
    branchId: string;
    classId: string;
    status: Student["status"];
    leftDate: string | null;
    leaveReason: string | null;
  }>,
): Promise<Student | null> {
  const [student] = await tx
    .update(students)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(students.id, id))
    .returning();
  return student ?? null;
}

/**
 * Class and branch lookups the student use cases need. They read the SHARED schema
 * tables directly rather than reaching into `modules/classes/infrastructure` — a
 * module may only be entered through its public index (CLAUDE.md, rule 3), and these
 * are two-column reads, not business logic borrowed from another module.
 */
export async function findClassBranch(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
): Promise<{ id: string; branchId: string; name: string } | null> {
  const [row] = await tx
    .select({ id: classes.id, branchId: classes.branchId, name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return row ?? null;
}

/** Active classes in a branch, keyed by name for the CSV import. */
export async function listActiveClassesInBranch(
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

export async function findBranchCode(_ctx: TenantContext, tx: Tx, branchId: string): Promise<string | null> {
  const [row] = await tx
    .select({ code: branches.code })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row?.code ?? null;
}

export async function closeEnrollment(
  _ctx: TenantContext,
  tx: Tx,
  enrollmentId: string,
  endDate: string,
  endReason: StudentEnrollment["endReason"],
): Promise<void> {
  await tx
    .update(studentEnrollments)
    .set({ endDate, endReason })
    .where(eq(studentEnrollments.id, enrollmentId));
}

export async function openEnrollment(
  ctx: TenantContext,
  tx: Tx,
  values: { studentId: string; branchId: string; classId: string; startDate: string },
): Promise<void> {
  await tx.insert(studentEnrollments).values({ ...values, createdBy: ctx.userId });
}
