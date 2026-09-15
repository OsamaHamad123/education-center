"use server";

import { createAction } from "@/shared/actions/create-action";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { computePeriods, type ComputedPeriod } from "../../domain/compute-periods";
import { findConflicts, redactConflict, type ExistingSlot, type PlannedSlot } from "../../domain/conflicts";
import { cellKey, planCopy, type CopySkip } from "../../domain/copy-timetable";
import {
  findClassRef,
  findScheduleSettings,
  findSlotById,
  findTeacherConflicts,
  insertSlot,
  insertSlots,
  listSlotsForBranch,
  listSlotsForClass,
  listTeacherOptions,
  updateSlot,
  type ClassRef,
  type SlotRow,
} from "../../infrastructure/timetable.repository";
import { conflictMessage } from "../conflict-message";
import { clearSlotSchema, copyTimetableSchema, setSlotSchema } from "../schemas";

/**
 * Filling, changing and clearing cells of the weekly grid (PROJECT_PLAN 10.4).
 *
 * Validation order is the order the rules are written in the plan: the teacher must be
 * linked and active in the branch, the day must be a working day, the period must
 * exist in the bell schedule, the class must be free, and only then the teacher must
 * be free — because that last check is the expensive, cross-branch one.
 */

export const setSlot = createAction({
  permission: "timetable.write",
  schema: setSlotSchema,
  audit: { action: "update", entity: "timetable_slot", entityId: (slot: { id: string }) => slot.id },
  revalidate: { paths: ["/timetable"] },
  handler: async ({ tx, ctx, input }) => {
    const prepared = await prepare(ctx, tx, input.classId);
    if (!prepared.ok) return prepared;
    const { classRef, periods, workingDays } = prepared.data;

    if (!workingDays.includes(input.dayOfWeek)) return err("CONFLICT", ar.timetable.dayNotWorking);

    const period = periods.find((item) => item.periodNumber === input.periodNumber);
    if (!period) return err("CONFLICT", ar.timetable.periodOutOfRange);

    const teachers = await listTeacherOptions(ctx, tx, classRef.branchId);
    if (!teachers.some((teacher) => teacher.id === input.teacherId)) {
      return err("CONFLICT", ar.timetable.teacherNotInBranch, {
        teacherId: [ar.timetable.teacherNotInBranch],
      });
    }

    // Editing an existing cell must not conflict with itself.
    let slotId = input.slotId;
    if (slotId) {
      const existing = await findSlotById(ctx, tx, slotId);
      if (!existing || existing.classId !== input.classId) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    } else {
      // The grid may be one refresh out of date, so an "empty" cell can already be full.
      const occupied = (await listSlotsForClass(ctx, tx, input.classId)).find(
        (slot) => slot.dayOfWeek === input.dayOfWeek && slot.periodNumber === input.periodNumber,
      );
      slotId = occupied?.id;
    }

    const candidate: PlannedSlot = {
      classId: input.classId,
      teacherId: input.teacherId,
      dayOfWeek: input.dayOfWeek,
      periodNumber: input.periodNumber,
      startTime: period.startTime,
      endTime: period.endTime,
    };

    const conflict = await firstConflict(ctx, tx, classRef.branchId, candidate, slotId);
    if (conflict) return err("CONFLICT", conflict);

    if (slotId) {
      const updated = await updateSlot(ctx, tx, slotId, {
        teacherId: input.teacherId,
        subjectId: input.subjectId,
        startTime: period.startTime,
        endTime: period.endTime,
        isActive: true,
      });
      if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
      return ok(updated);
    }

    return ok(
      await insertSlot(ctx, tx, { ...candidate, branchId: classRef.branchId, subjectId: input.subjectId }),
    );
  },
});

export const clearSlot = createAction({
  permission: "timetable.write",
  schema: clearSlotSchema,
  audit: { action: "delete", entity: "timetable_slot", entityId: (slot: { id: string }) => slot.id },
  revalidate: { paths: ["/timetable"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findSlotById(ctx, tx, input.slotId);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    // Deactivated, never deleted: class_sessions point at this row (CLAUDE.md).
    const cleared = await updateSlot(ctx, tx, input.slotId, { isActive: false });
    if (!cleared) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(cleared);
  },
});

export type CopyResult = { created: number; skipped: CopySkip[] };

export const copyTimetable = createAction({
  permission: "timetable.write",
  schema: copyTimetableSchema,
  audit: { action: "create", entity: "timetable_slot.copy" },
  revalidate: { paths: ["/timetable"] },
  handler: async ({ tx, ctx, input }) => {
    const prepared = await prepare(ctx, tx, input.targetClassId);
    if (!prepared.ok) return prepared;
    const { classRef, periods, workingDays } = prepared.data;

    // RLS decides whether the source is reachable at all; a class in another branch
    // simply is not found.
    const sourceRef = await findClassRef(ctx, tx, input.sourceClassId);
    if (!sourceRef || sourceRef.branchId !== classRef.branchId) {
      return err("NOT_FOUND", ar.errors.NOT_FOUND);
    }

    const source = await listSlotsForClass(ctx, tx, input.sourceClassId);
    if (source.length === 0) return err("CONFLICT", ar.timetable.copyEmpty);

    const target = await listSlotsForClass(ctx, tx, input.targetClassId);
    const teachers = await listTeacherOptions(ctx, tx, classRef.branchId);

    const plan = planCopy({
      source: source.map((slot) => ({
        subjectId: slot.subjectId,
        subjectName: slot.subjectName,
        teacherId: slot.teacherId,
        dayOfWeek: slot.dayOfWeek,
        periodNumber: slot.periodNumber,
      })),
      targetClassId: input.targetClassId,
      targetPeriods: periods,
      targetWorkingDays: workingDays,
      occupied: new Set(target.map((slot) => cellKey(slot.dayOfWeek, slot.periodNumber))),
      teachersInBranch: new Set(teachers.map((teacher) => teacher.id)),
    });

    // A copy is a bulk action, so one clash must not abort the other thirty slots.
    // Each candidate is checked against everything already accepted in this pass.
    const branchSlots = await listSlotsForBranch(ctx, tx, classRef.branchId);
    const accepted: (PlannedSlot & { subjectId: string })[] = [];
    const skipped = [...plan.skipped];

    for (const candidate of plan.create) {
      const existing = [...toExistingSlots(branchSlots), ...asExisting(accepted, classRef)];
      const local = findConflicts(candidate, existing);
      const foreign = await foreignTeacherConflicts(ctx, tx, [candidate], branchSlots);

      if (local.length > 0 || foreign.length > 0) {
        skipped.push({
          subjectName: candidate.subjectName,
          dayOfWeek: candidate.dayOfWeek,
          periodNumber: candidate.periodNumber,
          // Named honestly: the cell is free, the teacher is not — and saying which
          // reveals nothing, because it names no class and no branch.
          reason: local.some((c) => c.kind === "class_busy") ? "cell_occupied" : "teacher_busy",
        });
        continue;
      }
      accepted.push(candidate);
    }

    const created = await insertSlots(
      ctx,
      tx,
      accepted.map((slot) => ({ ...slot, branchId: classRef.branchId })),
    );

    return ok({ created, skipped } satisfies CopyResult);
  },
});

// --- shared helpers ----------------------------------------------------------

type Prepared = { classRef: ClassRef; periods: ComputedPeriod[]; workingDays: number[] };

/** Resolves the class and its bell schedule, or the reason neither can be used. */
async function prepare(ctx: TenantContext, tx: Tx, classId: string) {
  const classRef = await findClassRef(ctx, tx, classId);
  if (!classRef) return err("NOT_FOUND", ar.errors.NOT_FOUND);

  const settings = await findScheduleSettings(ctx, tx, classRef.branchId, classRef.track);
  if (!settings) return err("CONFLICT", ar.timetable.notConfigured);

  const periods = computePeriods({
    dayStartTime: settings.dayStartTime.slice(0, 5),
    periodDurationMin: settings.periodDurationMin,
    periodsCount: settings.periodsCount,
    breaks: settings.breaks,
  });

  return ok({ classRef, periods, workingDays: settings.workingDays } satisfies Prepared);
}

/**
 * The first reason this cell cannot be written, as a sentence this viewer may read —
 * or null. In-branch clashes are found by the domain against rows RLS allows; the
 * cross-branch half comes from the redacting SQL function (drizzle/0005).
 */
async function firstConflict(
  ctx: TenantContext,
  tx: Tx,
  branchId: string,
  candidate: PlannedSlot,
  ignoreSlotId: string | undefined,
): Promise<string | null> {
  const branchSlots = await listSlotsForBranch(ctx, tx, branchId);
  const local = findConflicts(candidate, toExistingSlots(branchSlots), ignoreSlotId ? { ignoreSlotId } : {});
  const first = local[0];
  if (first) return conflictMessage(redactConflict(first, ctx));

  const foreign = await foreignTeacherConflicts(ctx, tx, [candidate], branchSlots, ignoreSlotId);
  const firstForeign = foreign[0];
  return firstForeign ? conflictMessage(redactConflict(firstForeign, ctx)) : null;
}

/**
 * Teacher clashes OUTSIDE the rows this role can read. Same-branch rows the function
 * also returns are dropped, because `findConflicts` has already judged them with the
 * full detail RLS allows.
 */
async function foreignTeacherConflicts(
  ctx: TenantContext,
  tx: Tx,
  candidates: readonly PlannedSlot[],
  visible: readonly SlotRow[],
  ignoreSlotId?: string,
) {
  const visibleIds = new Set(visible.map((slot) => slot.id));

  const byCandidate = await findTeacherConflicts(
    ctx,
    tx,
    candidates.map((candidate) => (ignoreSlotId ? { ...candidate, ignoreSlotId } : candidate)),
  );

  return [...byCandidate.values()]
    .flat()
    .filter((slot) => !visibleIds.has(slot.id))
    .map((slot) => ({ kind: "teacher_busy", with: slot }) as const);
}

function toExistingSlots(slots: readonly SlotRow[]): ExistingSlot[] {
  return slots.map((slot) => ({
    id: slot.id,
    branchId: slot.branchId,
    className: slot.className,
    // Every row here is inside the viewer's own branch, so the branch name is never
    // the thing that needs hiding — the redaction only ever removes foreign names.
    branchName: "",
    classId: slot.classId,
    teacherId: slot.teacherId,
    dayOfWeek: slot.dayOfWeek,
    periodNumber: slot.periodNumber,
    startTime: slot.startTime.slice(0, 5),
    endTime: slot.endTime.slice(0, 5),
  }));
}

/** Slots accepted earlier in the same copy, so two source cells cannot both land. */
function asExisting(
  accepted: readonly (PlannedSlot & { subjectId: string })[],
  classRef: ClassRef,
): ExistingSlot[] {
  return accepted.map((slot, index) => ({
    ...slot,
    id: `pending-${index}`,
    branchId: classRef.branchId,
    className: classRef.name,
    branchName: "",
  }));
}
