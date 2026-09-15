import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  account,
  branches,
  classSessions,
  session,
  teacherBranches,
  teacherRateHistory,
  teachers,
  timetableSlots,
  user,
  type Teacher,
} from "@/shared/db/schema";

export type TeacherRow = {
  id: string;
  fullName: string;
  phone: string;
  specialization: string | null;
  status: Teacher["status"];
  ratePiastersScientific: number;
  ratePiastersLiterary: number;
  branchCount: number;
  /** Whether this teacher is linked to the viewer's branch. */
  linkedHere: boolean;
};

/**
 * RLS already narrows a branch admin to teachers linked to their branch. A super
 * admin sees everyone, and their selected branch is applied here as a filter, the
 * same pattern as students.
 */
export async function listTeachers(ctx: TenantContext, tx: Tx): Promise<TeacherRow[]> {
  const rows = await tx.select().from(teachers).orderBy(asc(teachers.fullName));

  const links = await tx
    .select({ teacherId: teacherBranches.teacherId, branchId: teacherBranches.branchId })
    .from(teacherBranches)
    .where(eq(teacherBranches.isActive, true));

  const byTeacher = new Map<string, string[]>();
  for (const link of links) {
    byTeacher.set(link.teacherId, [...(byTeacher.get(link.teacherId) ?? []), link.branchId]);
  }

  const scoped = rows.filter((teacher) => {
    if (!ctx.branchId) return true;
    return (byTeacher.get(teacher.id) ?? []).includes(ctx.branchId);
  });

  return scoped.map((teacher) => ({
    id: teacher.id,
    fullName: teacher.fullName,
    phone: teacher.phone,
    specialization: teacher.specialization,
    status: teacher.status,
    ratePiastersScientific: teacher.ratePiastersScientific,
    ratePiastersLiterary: teacher.ratePiastersLiterary,
    branchCount: (byTeacher.get(teacher.id) ?? []).length,
    linkedHere: ctx.branchId ? (byTeacher.get(teacher.id) ?? []).includes(ctx.branchId) : false,
  }));
}

export async function findTeacherById(_ctx: TenantContext, tx: Tx, id: string): Promise<Teacher | null> {
  const [teacher] = await tx.select().from(teachers).where(eq(teachers.id, id)).limit(1);
  return teacher ?? null;
}

export async function findTeacherByPhone(
  _ctx: TenantContext,
  tx: Tx,
  phone: string,
): Promise<Teacher | null> {
  const [teacher] = await tx.select().from(teachers).where(eq(teachers.phone, phone)).limit(1);
  return teacher ?? null;
}

/**
 * Resolves a teacher id from a full phone number, for the "link an existing teacher"
 * flow. Goes through the SECURITY DEFINER function from migration 0004, because a
 * branch admin cannot yet see the teacher they are about to link (see that file).
 */
export async function lookupTeacherIdForLinking(
  _ctx: TenantContext,
  tx: Tx,
  phone: string,
): Promise<string | null> {
  const result = await tx.execute(sql`select app_lookup_teacher_for_linking(${phone}) as id`);
  const id = (result[0] as { id: string | null } | undefined)?.id;
  return id ?? null;
}

export type TeacherBranchLink = {
  branchId: string;
  branchName: string | null;
  isActive: boolean;
  linkedAt: Date;
};

export async function listTeacherBranches(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<TeacherBranchLink[]> {
  return tx
    .select({
      branchId: teacherBranches.branchId,
      branchName: branches.name,
      isActive: teacherBranches.isActive,
      linkedAt: teacherBranches.linkedAt,
    })
    .from(teacherBranches)
    .leftJoin(branches, eq(branches.id, teacherBranches.branchId))
    .where(eq(teacherBranches.teacherId, teacherId))
    .orderBy(asc(branches.name));
}

export type RateHistoryRow = {
  id: string;
  ratePiastersScientific: number;
  ratePiastersLiterary: number;
  effectiveFrom: string;
  createdAt: Date;
};

export async function listRateHistory(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<RateHistoryRow[]> {
  return tx
    .select({
      id: teacherRateHistory.id,
      ratePiastersScientific: teacherRateHistory.ratePiastersScientific,
      ratePiastersLiterary: teacherRateHistory.ratePiastersLiterary,
      effectiveFrom: teacherRateHistory.effectiveFrom,
      createdAt: teacherRateHistory.createdAt,
    })
    .from(teacherRateHistory)
    .where(eq(teacherRateHistory.teacherId, teacherId))
    .orderBy(desc(teacherRateHistory.effectiveFrom), desc(teacherRateHistory.createdAt));
}

/** Weekly teaching load: how many active slots this teacher holds, per branch. */
export async function weeklyLoad(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<{ branchName: string | null; slots: number }[]> {
  return tx
    .select({ branchName: branches.name, slots: count() })
    .from(timetableSlots)
    .leftJoin(branches, eq(branches.id, timetableSlots.branchId))
    .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.isActive, true)))
    .groupBy(branches.name);
}

export type RecentSession = {
  id: string;
  sessionDate: string;
  subjectName: string;
  branchName: string | null;
  status: string;
};

export async function recentSessions(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
  since: string,
): Promise<RecentSession[]> {
  return tx
    .select({
      id: classSessions.id,
      sessionDate: classSessions.sessionDate,
      subjectName: classSessions.subjectName,
      branchName: branches.name,
      status: classSessions.status,
    })
    .from(classSessions)
    .leftJoin(branches, eq(branches.id, classSessions.branchId))
    .where(and(eq(classSessions.teacherId, teacherId), gte(classSessions.sessionDate, since)))
    .orderBy(desc(classSessions.sessionDate))
    .limit(20);
}

export async function insertTeacher(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    fullName: string;
    phone: string;
    specialization: string | null;
    ratePiastersScientific: number;
    ratePiastersLiterary: number;
  },
): Promise<Teacher> {
  const [teacher] = await tx.insert(teachers).values(values).returning();
  if (!teacher) throw new Error("insertTeacher returned no row");
  return teacher;
}

export async function updateTeacher(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    fullName: string;
    specialization: string | null;
    ratePiastersScientific: number;
    ratePiastersLiterary: number;
    status: Teacher["status"];
  }>,
): Promise<Teacher | null> {
  const [teacher] = await tx
    .update(teachers)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(teachers.id, id))
    .returning();
  return teacher ?? null;
}

export async function recordRateChange(
  ctx: TenantContext,
  tx: Tx,
  values: {
    teacherId: string;
    ratePiastersScientific: number;
    ratePiastersLiterary: number;
    effectiveFrom: string;
  },
): Promise<void> {
  await tx.insert(teacherRateHistory).values({ ...values, changedBy: ctx.userId });
}

export async function linkTeacherToBranch(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
  branchId: string,
): Promise<void> {
  await tx
    .insert(teacherBranches)
    .values({ teacherId, branchId, isActive: true })
    .onConflictDoUpdate({
      target: [teacherBranches.teacherId, teacherBranches.branchId],
      // Re-linking someone who was unlinked reuses the row rather than losing when
      // they were first linked.
      set: { isActive: true },
    });
}

export async function setBranchLinkActive(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
  branchId: string,
  isActive: boolean,
): Promise<void> {
  await tx
    .update(teacherBranches)
    .set({ isActive })
    .where(and(eq(teacherBranches.teacherId, teacherId), eq(teacherBranches.branchId, branchId)));
}

/** The login account attached to a teacher, if one exists. */
export async function findTeacherUser(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<{ id: string } | null> {
  const [row] = await tx.select({ id: user.id }).from(user).where(eq(user.teacherId, teacherId)).limit(1);
  return row ?? null;
}

export async function insertTeacherAccount(
  _ctx: TenantContext,
  tx: Tx,
  values: { userId: string; name: string; phone: string; passwordHash: string },
): Promise<void> {
  await tx.insert(user).values({
    id: values.userId,
    name: values.name,
    // Email sign-in is disabled; Better Auth still requires the column.
    email: `${values.phone.replace("+", "")}@teachers.local`,
    emailVerified: true,
    username: values.phone,
    displayUsername: values.phone,
    role: "teacher",
    teacherId: await teacherIdOfUser(tx, values.userId, values.phone),
  });

  await tx.insert(account).values({
    id: `acc_${values.userId}`,
    accountId: values.userId,
    providerId: "credential",
    userId: values.userId,
    password: values.passwordHash,
  });
}

/** Resolves the teacher id to attach, keeping the CHECK constraint satisfied. */
async function teacherIdOfUser(tx: Tx, _userId: string, phone: string): Promise<string> {
  const [teacher] = await tx
    .select({ id: teachers.id })
    .from(teachers)
    .where(eq(teachers.phone, phone))
    .limit(1);
  if (!teacher) throw new Error(`No teacher for phone ${phone}`);
  return teacher.id;
}

export async function resetTeacherPassword(
  _ctx: TenantContext,
  tx: Tx,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await tx
    .update(account)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  // A reset must end every session that the old code opened.
  await tx.delete(session).where(eq(session.userId, userId));
}

export async function setTeacherUserActive(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
  isActive: boolean,
): Promise<void> {
  const found = await findTeacherUser(_ctx, tx, teacherId);
  if (!found) return;
  await tx.update(user).set({ isActive, updatedAt: new Date() }).where(eq(user.id, found.id));
  if (!isActive) await tx.delete(session).where(eq(session.userId, found.id));
}
