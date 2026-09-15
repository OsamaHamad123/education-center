import { and, asc, count, eq, ne } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { classSessions, classes, students, type Class } from "@/shared/db/schema";

export type ClassWithCounts = Class & { studentCount: number; sessionCount: number };

/**
 * A super admin reads every branch at the RLS layer by design, so their selected
 * branch is applied here as an ordinary filter (see docs/PROGRESS.md). Branch admins
 * are narrowed by RLS regardless, so this is belt and braces for them.
 */
function branchScope(ctx: TenantContext) {
  return ctx.branchId ? eq(classes.branchId, ctx.branchId) : undefined;
}

export async function listClasses(ctx: TenantContext, tx: Tx): Promise<ClassWithCounts[]> {
  const rows = await tx.select().from(classes).where(branchScope(ctx)).orderBy(asc(classes.name));

  const studentCounts = await tx
    .select({ classId: students.classId, total: count() })
    .from(students)
    .where(eq(students.status, "active"))
    .groupBy(students.classId);

  const sessionCounts = await tx
    .select({ classId: classSessions.classId, total: count() })
    .from(classSessions)
    .groupBy(classSessions.classId);

  const studentsByClass = new Map(studentCounts.map((r) => [r.classId, r.total]));
  const sessionsByClass = new Map(sessionCounts.map((r) => [r.classId, r.total]));

  return rows.map((klass) => ({
    ...klass,
    studentCount: studentsByClass.get(klass.id) ?? 0,
    sessionCount: sessionsByClass.get(klass.id) ?? 0,
  }));
}

/** Active classes only, for the pickers on the student forms. */
export async function listActiveClassOptions(
  ctx: TenantContext,
  tx: Tx,
  branchId?: string,
): Promise<{ id: string; name: string; branchId: string; track: Class["track"] }[]> {
  const scope = branchId ? eq(classes.branchId, branchId) : branchScope(ctx);
  return tx
    .select({
      id: classes.id,
      name: classes.name,
      branchId: classes.branchId,
      track: classes.track,
    })
    .from(classes)
    .where(scope ? and(eq(classes.isActive, true), scope) : eq(classes.isActive, true))
    .orderBy(asc(classes.name));
}

export async function findClassById(_ctx: TenantContext, tx: Tx, id: string): Promise<Class | null> {
  const [klass] = await tx.select().from(classes).where(eq(classes.id, id)).limit(1);
  return klass ?? null;
}

export async function findClassByName(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  name: string,
  excludeId?: string,
): Promise<Class | null> {
  const base = and(eq(classes.branchId, branchId), eq(classes.name, name));
  const [klass] = await tx
    .select()
    .from(classes)
    .where(excludeId ? and(base, ne(classes.id, excludeId)) : base)
    .limit(1);
  return klass ?? null;
}

export async function countActiveStudentsInClass(
  _ctx: TenantContext,
  tx: Tx,
  classId: string,
): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(students)
    .where(and(eq(students.classId, classId), eq(students.status, "active")));
  return row?.total ?? 0;
}

export async function countSessionsForClass(_ctx: TenantContext, tx: Tx, classId: string): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(classSessions)
    .where(eq(classSessions.classId, classId));
  return row?.total ?? 0;
}

export async function insertClass(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    branchId: string;
    name: string;
    track: Class["track"];
    gender: Class["gender"];
    gradeLevel: string;
  },
): Promise<Class> {
  const [klass] = await tx.insert(classes).values(values).returning();
  if (!klass) throw new Error("insertClass returned no row");
  return klass;
}

export async function updateClass(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    name: string;
    track: Class["track"];
    gender: Class["gender"];
    gradeLevel: string;
    isActive: boolean;
  }>,
): Promise<Class | null> {
  const [klass] = await tx
    .update(classes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(classes.id, id))
    .returning();
  return klass ?? null;
}
