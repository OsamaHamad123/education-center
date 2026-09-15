import { and, asc, count, eq, ne } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { classSessions, subjects, timetableSlots, type Subject } from "@/shared/db/schema";

export type SubjectWithUsage = Subject & { slotCount: number; sessionCount: number };

export async function listSubjects(_ctx: TenantContext, tx: Tx): Promise<SubjectWithUsage[]> {
  const rows = await tx.select().from(subjects).orderBy(asc(subjects.name));

  const slotCounts = await tx
    .select({ subjectId: timetableSlots.subjectId, total: count() })
    .from(timetableSlots)
    .groupBy(timetableSlots.subjectId);

  // Sessions snapshot the subject NAME, not its id (7.13), so usage is counted by name.
  const sessionCounts = await tx
    .select({ subjectName: classSessions.subjectName, total: count() })
    .from(classSessions)
    .groupBy(classSessions.subjectName);

  const slotsBySubject = new Map(slotCounts.map((r) => [r.subjectId, r.total]));
  const sessionsByName = new Map(sessionCounts.map((r) => [r.subjectName, r.total]));

  return rows.map((subject) => ({
    ...subject,
    slotCount: slotsBySubject.get(subject.id) ?? 0,
    sessionCount: sessionsByName.get(subject.name) ?? 0,
  }));
}

export async function findSubjectById(_ctx: TenantContext, tx: Tx, id: string) {
  const [subject] = await tx.select().from(subjects).where(eq(subjects.id, id)).limit(1);
  return subject ?? null;
}

export async function findSubjectByName(_ctx: TenantContext, tx: Tx, name: string, excludeId?: string) {
  const [subject] = await tx
    .select()
    .from(subjects)
    .where(excludeId ? and(eq(subjects.name, name), ne(subjects.id, excludeId)) : eq(subjects.name, name))
    .limit(1);
  return subject ?? null;
}

export async function countSlotsUsingSubject(_ctx: TenantContext, tx: Tx, subjectId: string) {
  const [row] = await tx
    .select({ total: count() })
    .from(timetableSlots)
    .where(and(eq(timetableSlots.subjectId, subjectId), eq(timetableSlots.isActive, true)));
  return row?.total ?? 0;
}

export async function insertSubject(_ctx: TenantContext, tx: Tx, name: string): Promise<Subject> {
  const [subject] = await tx.insert(subjects).values({ name }).returning();
  if (!subject) throw new Error("insertSubject returned no row");
  return subject;
}

export async function updateSubject(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{ name: string; isActive: boolean }>,
): Promise<Subject | null> {
  const [subject] = await tx
    .update(subjects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(subjects.id, id))
    .returning();
  return subject ?? null;
}
