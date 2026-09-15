import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import {
  branchBreaks,
  branches,
  branchScheduleSettings,
  classes,
  subjects,
  teacherBranches,
  teachers,
  timetableSlots,
  type BranchScheduleSettings,
  type TimetableSlot,
  type Track,
} from "@/shared/db/schema";
import type { BellBreak } from "../domain/compute-periods";
import type { ExistingSlot, PlannedSlot } from "../domain/conflicts";

/**
 * Every function here takes a TenantContext and runs inside `withTenant`, so RLS is
 * the floor under all of it. The one exception is `findTeacherConflicts`, which goes
 * through the SECURITY DEFINER function from migration 0005 — see that file for why
 * a cross-branch question cannot be asked any other way, and what it refuses to say.
 */

// --- bell schedule -----------------------------------------------------------

export type ScheduleSettingsWithBreaks = BranchScheduleSettings & { breaks: BellBreak[] };

export async function findScheduleSettings(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  track: Track,
): Promise<ScheduleSettingsWithBreaks | null> {
  const [settings] = await tx
    .select()
    .from(branchScheduleSettings)
    .where(and(eq(branchScheduleSettings.branchId, branchId), eq(branchScheduleSettings.track, track)))
    .limit(1);
  if (!settings) return null;

  return { ...settings, breaks: await listBreaks(_ctx, tx, settings.id) };
}

export async function listBreaks(_ctx: TenantContext, tx: Tx, settingsId: string): Promise<BellBreak[]> {
  return tx
    .select({
      afterPeriod: branchBreaks.afterPeriod,
      durationMin: branchBreaks.durationMin,
      label: branchBreaks.label,
    })
    .from(branchBreaks)
    .where(eq(branchBreaks.settingsId, settingsId))
    .orderBy(asc(branchBreaks.afterPeriod));
}

export async function upsertScheduleSettings(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    branchId: string;
    track: Track;
    dayStartTime: string;
    periodDurationMin: number;
    periodsCount: number;
    workingDays: number[];
  },
): Promise<BranchScheduleSettings> {
  const [saved] = await tx
    .insert(branchScheduleSettings)
    .values(values)
    .onConflictDoUpdate({
      target: [branchScheduleSettings.branchId, branchScheduleSettings.track],
      set: {
        dayStartTime: values.dayStartTime,
        periodDurationMin: values.periodDurationMin,
        periodsCount: values.periodsCount,
        workingDays: values.workingDays,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!saved) throw new Error("upsertScheduleSettings returned no row");
  return saved;
}

/** Breaks are a small, ordered set with no identity of their own, so they are replaced. */
export async function replaceBreaks(
  _ctx: TenantContext,
  tx: Tx,
  settingsId: string,
  items: readonly BellBreak[],
): Promise<void> {
  await tx.delete(branchBreaks).where(eq(branchBreaks.settingsId, settingsId));
  if (items.length === 0) return;

  await tx.insert(branchBreaks).values(
    items.map((item) => ({
      settingsId,
      afterPeriod: item.afterPeriod,
      durationMin: item.durationMin,
      label: item.label,
    })),
  );
}

// --- slots -------------------------------------------------------------------

export type SlotRow = {
  id: string;
  branchId: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
};

const slotColumns = {
  id: timetableSlots.id,
  branchId: timetableSlots.branchId,
  classId: timetableSlots.classId,
  className: classes.name,
  teacherId: timetableSlots.teacherId,
  teacherName: teachers.fullName,
  subjectId: timetableSlots.subjectId,
  subjectName: subjects.name,
  dayOfWeek: timetableSlots.dayOfWeek,
  periodNumber: timetableSlots.periodNumber,
  startTime: timetableSlots.startTime,
  endTime: timetableSlots.endTime,
};

function slotQuery(tx: Tx) {
  return tx
    .select(slotColumns)
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .innerJoin(teachers, eq(teachers.id, timetableSlots.teacherId))
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId));
}

export async function listSlotsForClass(_ctx: TenantContext, tx: Tx, classId: string): Promise<SlotRow[]> {
  return slotQuery(tx)
    .where(and(eq(timetableSlots.classId, classId), eq(timetableSlots.isActive, true)))
    .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.periodNumber));
}

/**
 * A teacher's whole week. RLS decides the reach: a super admin sees every branch, a
 * branch admin only their own, and a teacher only what they are entitled to.
 */
export async function listSlotsForTeacher(
  _ctx: TenantContext,
  tx: Tx,
  teacherId: string,
): Promise<(SlotRow & { branchName: string })[]> {
  return tx
    .select({ ...slotColumns, branchName: branches.name })
    .from(timetableSlots)
    .innerJoin(classes, eq(classes.id, timetableSlots.classId))
    .innerJoin(teachers, eq(teachers.id, timetableSlots.teacherId))
    .innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId))
    .innerJoin(branches, eq(branches.id, timetableSlots.branchId))
    .where(and(eq(timetableSlots.teacherId, teacherId), eq(timetableSlots.isActive, true)))
    .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.startTime));
}

/** Every active slot in one branch — the visible half of a conflict check. */
export async function listSlotsForBranch(_ctx: TenantContext, tx: Tx, branchId: string): Promise<SlotRow[]> {
  return slotQuery(tx)
    .where(and(eq(timetableSlots.branchId, branchId), eq(timetableSlots.isActive, true)))
    .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.periodNumber));
}

/** Active slots of every class in one branch on one track — the recompute scope. */
export async function listSlotsForBranchTrack(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
  track: Track,
): Promise<SlotRow[]> {
  return slotQuery(tx)
    .where(
      and(eq(timetableSlots.branchId, branchId), eq(timetableSlots.isActive, true), eq(classes.track, track)),
    )
    .orderBy(asc(timetableSlots.dayOfWeek), asc(timetableSlots.periodNumber));
}

export async function findSlotById(_ctx: TenantContext, tx: Tx, id: string): Promise<TimetableSlot | null> {
  const [slot] = await tx.select().from(timetableSlots).where(eq(timetableSlots.id, id)).limit(1);
  return slot ?? null;
}

export async function insertSlot(
  _ctx: TenantContext,
  tx: Tx,
  values: PlannedSlot & { branchId: string; subjectId: string },
): Promise<TimetableSlot> {
  const [slot] = await tx.insert(timetableSlots).values(values).returning();
  if (!slot) throw new Error("insertSlot returned no row");
  return slot;
}

export async function insertSlots(
  _ctx: TenantContext,
  tx: Tx,
  values: readonly (PlannedSlot & { branchId: string; subjectId: string })[],
): Promise<number> {
  if (values.length === 0) return 0;
  const rows = await tx
    .insert(timetableSlots)
    .values([...values])
    .returning({ id: timetableSlots.id });
  return rows.length;
}

export async function updateSlot(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    teacherId: string;
    subjectId: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>,
): Promise<TimetableSlot | null> {
  const [slot] = await tx
    .update(timetableSlots)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(timetableSlots.id, id))
    .returning();
  return slot ?? null;
}

/** Retimes many slots at once — the tail of a settings change. */
export async function retimeSlots(
  _ctx: TenantContext,
  tx: Tx,
  moves: readonly { id: string; startTime: string; endTime: string }[],
): Promise<void> {
  for (const move of moves) {
    await tx
      .update(timetableSlots)
      .set({ startTime: move.startTime, endTime: move.endTime, updatedAt: new Date() })
      .where(eq(timetableSlots.id, move.id));
  }
}

export async function deactivateSlots(_ctx: TenantContext, tx: Tx, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(timetableSlots)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(timetableSlots.id, [...ids]));
}

// --- conflicts ---------------------------------------------------------------

export type ConflictCandidate = PlannedSlot & { ignoreSlotId?: string };

/**
 * Cross-branch teacher clashes, already redacted by the database for this role
 * (drizzle/0005). A row whose `classId` is null means "busy, and you may not know
 * more" — the domain's `redactConflict` reaches the same conclusion independently.
 */
export async function findTeacherConflicts(
  _ctx: TenantContext,
  tx: Tx,
  candidates: readonly ConflictCandidate[],
): Promise<Map<number, ExistingSlot[]>> {
  const byCandidate = new Map<number, ExistingSlot[]>();
  if (candidates.length === 0) return byCandidate;

  const payload = candidates.map((candidate) => ({
    teacherId: candidate.teacherId,
    dayOfWeek: candidate.dayOfWeek,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    ignoreSlotId: candidate.ignoreSlotId ?? "",
  }));

  const rows = await tx.execute(
    sql`select * from app_timetable_conflicts(${JSON.stringify(payload)}::jsonb)`,
  );

  for (const raw of rows as unknown as ConflictFunctionRow[]) {
    const candidate = candidates[raw.candidate_index];
    if (!candidate) continue;

    const list = byCandidate.get(raw.candidate_index) ?? [];
    list.push({
      // Nulls are the redaction, not missing data: keep them out of the shape the
      // domain reasons about by substituting values that name nothing.
      id: raw.slot_id ?? "",
      branchId: raw.branch_id ?? REDACTED_BRANCH,
      classId: raw.class_id ?? REDACTED_CLASS,
      className: raw.class_name ?? "",
      branchName: raw.branch_name ?? "",
      teacherId: candidate.teacherId,
      dayOfWeek: candidate.dayOfWeek,
      periodNumber: raw.period_number ?? 0,
      startTime: candidate.startTime,
      endTime: candidate.endTime,
    });
    byCandidate.set(raw.candidate_index, list);
  }

  return byCandidate;
}

/**
 * Sentinels for a branch and class the viewer may not be told about. They are not
 * real ids, so the domain's `slot.branchId === viewer.branchId` comparison is false
 * and the conflict redacts to "busy" — which is the truthful answer.
 */
const REDACTED_BRANCH = "redacted-branch";
const REDACTED_CLASS = "redacted-class";

type ConflictFunctionRow = {
  candidate_index: number;
  slot_id: string | null;
  branch_id: string | null;
  class_id: string | null;
  period_number: number | null;
  same_branch: boolean;
  class_name: string | null;
  branch_name: string | null;
};

// --- options for the cell dialog ---------------------------------------------

export type TeacherOption = { id: string; fullName: string };

/** Teachers who may actually stand in this branch's classroom: linked AND active. */
export async function listTeacherOptions(
  _ctx: TenantContext,
  tx: Tx,
  branchId: string,
): Promise<TeacherOption[]> {
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

export type SubjectOption = { id: string; name: string };

export async function listSubjectOptions(_ctx: TenantContext, tx: Tx): Promise<SubjectOption[]> {
  return tx
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(eq(subjects.isActive, true))
    .orderBy(asc(subjects.name));
}

export type ClassRef = { id: string; name: string; branchId: string; track: Track; isActive: boolean };

export async function findClassRef(_ctx: TenantContext, tx: Tx, classId: string): Promise<ClassRef | null> {
  const [row] = await tx
    .select({
      id: classes.id,
      name: classes.name,
      branchId: classes.branchId,
      track: classes.track,
      isActive: classes.isActive,
    })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return row ?? null;
}

export async function listClassRefs(_ctx: TenantContext, tx: Tx): Promise<ClassRef[]> {
  return tx
    .select({
      id: classes.id,
      name: classes.name,
      branchId: classes.branchId,
      track: classes.track,
      isActive: classes.isActive,
    })
    .from(classes)
    .where(eq(classes.isActive, true))
    .orderBy(asc(classes.name));
}

export async function findBranchName(_ctx: TenantContext, tx: Tx, branchId: string): Promise<string | null> {
  const [row] = await tx
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row?.name ?? null;
}
