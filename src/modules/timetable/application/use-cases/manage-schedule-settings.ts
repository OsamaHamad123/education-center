"use server";

import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { computePeriods, validateBellSchedule } from "../../domain/compute-periods";
import { findConflicts, type ExistingSlot } from "../../domain/conflicts";
import {
  isEmptyPlan,
  movedSlotsAsCandidates,
  planRecompute,
  type SlotToRecompute,
} from "../../domain/recompute";
import {
  deactivateSlots,
  findTeacherConflicts,
  listSlotsForBranchTrack,
  replaceBreaks,
  retimeSlots,
  upsertScheduleSettings,
  type SlotRow,
} from "../../infrastructure/timetable.repository";
import { saveScheduleSettingsSchema } from "../schemas";

/**
 * Saving the bell schedule (PROJECT_PLAN 10.4: "Changing settings recomputes future
 * slot times; warns if it creates conflicts and lists them").
 *
 * The recompute is not a side effect worth a footnote — it is the whole risk of this
 * screen. Slot times are a cached projection of these four numbers, so saving the form
 * without recomputing would leave a branch whose grid says 08:00 and whose database
 * says 09:00, and whose attendance sheets then snapshot the wrong times.
 *
 * Everything below happens in ONE transaction: settings, breaks, retimes and
 * deactivations commit together or not at all.
 */

export type DroppedSlot = { className: string; dayOfWeek: number; periodNumber: number };

export type ScheduleSaveReport = {
  retimed: number;
  deactivated: (DroppedSlot & { reason: "period_removed" | "day_removed" })[];
  /** Slots dropped because their NEW time collided with a teacher's other class. */
  conflicted: DroppedSlot[];
  unchanged: number;
};

export const saveScheduleSettings = createAction({
  permission: "timetable.settings",
  schema: saveScheduleSettingsSchema,
  audit: { action: "update", entity: "branch_schedule_settings" },
  revalidate: { paths: ["/timetable", "/timetable/settings"] },
  handler: async ({ tx, ctx, input }) => {
    const branchId = ctx.branchId;
    if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const schedule = {
      dayStartTime: input.dayStartTime,
      periodDurationMin: input.periodDurationMin,
      periodsCount: input.periodsCount,
      breaks: input.breaks,
    };

    const violation = validateBellSchedule({ ...schedule, workingDays: input.workingDays });
    if (violation) return err("VALIDATION_ERROR", ar.timetable.scheduleViolations[violation]);

    const settings = await upsertScheduleSettings(ctx, tx, {
      branchId,
      track: input.track,
      ...schedule,
      workingDays: input.workingDays,
    });
    await replaceBreaks(ctx, tx, settings.id, input.breaks);

    const periods = computePeriods(schedule);
    const slots = (await listSlotsForBranchTrack(ctx, tx, branchId, input.track)).map(toRecomputeSlot);
    const plan = planRecompute(slots, periods, input.workingDays);

    if (isEmptyPlan(plan)) {
      return ok(emptyReport(plan.unchangedCount));
    }

    // A branch shifting its day can walk a SHARED teacher into another branch's period.
    // Rather than let the exclusion constraint abort the whole save with a raw error,
    // the colliding slots are found first and only those are dropped.
    const moved = movedSlotsAsCandidates(plan, slots);
    const movedIds = new Set(moved.map((slot) => slot.id));
    const stationary = slots.filter((slot) => !movedIds.has(slot.id)).map(asExisting(branchId));

    const foreign = await findTeacherConflicts(
      ctx,
      tx,
      moved.map((slot) => ({ ...slot, ignoreSlotId: slot.id })),
    );

    const conflicted: (DroppedSlot & { id: string })[] = [];
    const safe: typeof moved = [];

    for (const [index, candidate] of moved.entries()) {
      // A slot that is itself being moved is not a conflict: it is about to vacate.
      const acrossBranches = (foreign.get(index) ?? []).filter((slot) => !movedIds.has(slot.id));
      const withinBranch = findConflicts(candidate, stationary, { ignoreSlotId: candidate.id });

      if (acrossBranches.length > 0 || withinBranch.length > 0) {
        conflicted.push({
          id: candidate.id,
          className: candidate.className,
          dayOfWeek: candidate.dayOfWeek,
          periodNumber: candidate.periodNumber,
        });
        continue;
      }
      safe.push(candidate);
    }

    await retimeSlots(
      ctx,
      tx,
      safe.map((slot) => ({ id: slot.id, startTime: slot.startTime, endTime: slot.endTime })),
    );
    await deactivateSlots(ctx, tx, [
      ...plan.deactivate.map((slot) => slot.id),
      ...conflicted.map((slot) => slot.id),
    ]);

    return ok({
      retimed: safe.length,
      deactivated: plan.deactivate.map(({ className, dayOfWeek, periodNumber, reason }) => ({
        className,
        dayOfWeek,
        periodNumber,
        reason,
      })),
      conflicted: conflicted.map(({ className, dayOfWeek, periodNumber }) => ({
        className,
        dayOfWeek,
        periodNumber,
      })),
      unchanged: plan.unchangedCount,
    } satisfies ScheduleSaveReport);
  },
});

/** `time` columns come back as `HH:mm:ss`; everything above works in `HH:mm`. */
function toRecomputeSlot(slot: SlotRow): SlotToRecompute {
  return {
    id: slot.id,
    classId: slot.classId,
    className: slot.className,
    teacherId: slot.teacherId,
    dayOfWeek: slot.dayOfWeek,
    periodNumber: slot.periodNumber,
    startTime: slot.startTime.slice(0, 5),
    endTime: slot.endTime.slice(0, 5),
  };
}

/** Every slot here is inside the caller's own branch, so nothing needs hiding. */
function asExisting(branchId: string) {
  return (slot: SlotToRecompute): ExistingSlot => ({ ...slot, branchId, branchName: "" });
}

function emptyReport(unchanged: number): ScheduleSaveReport {
  return { retimed: 0, deactivated: [], conflicted: [], unchanged };
}
