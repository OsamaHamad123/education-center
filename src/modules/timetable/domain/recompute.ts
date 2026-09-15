import type { ComputedPeriod } from "./compute-periods";
import type { IsoTime } from "@/shared/lib/time";

/**
 * What changing the bell schedule does to the slots already drawn (rule 10.4:
 * "Changing settings recomputes future slot times; warns if it creates conflicts").
 *
 * Slot times are a cached projection of the schedule, so moving the first bell by ten
 * minutes silently invalidates every slot in that branch and track. Recomputing is not
 * optional — but it is also not free: shortening the day, or dropping a working day,
 * strands slots that no longer have anywhere to be. Those are DEACTIVATED rather than
 * deleted (CLAUDE.md: archive, never hard-delete) and reported back so the admin finds
 * out from a list, not from an empty grid on Saturday morning.
 */

export type SlotToRecompute = {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: IsoTime;
  endTime: IsoTime;
};

export type RecomputePlan = {
  /** Slots that keep their period but move in time. */
  retime: { id: string; startTime: IsoTime; endTime: IsoTime }[];
  /** Slots with nowhere left to go, with the reason to show the admin. */
  deactivate: {
    id: string;
    className: string;
    dayOfWeek: number;
    periodNumber: number;
    reason: "period_removed" | "day_removed";
  }[];
  /** Slots the change does not touch at all. */
  unchangedCount: number;
};

export function planRecompute(
  slots: readonly SlotToRecompute[],
  periods: readonly ComputedPeriod[],
  workingDays: readonly number[],
): RecomputePlan {
  const byPeriod = new Map(periods.map((period) => [period.periodNumber, period]));
  const plan: RecomputePlan = { retime: [], deactivate: [], unchangedCount: 0 };

  for (const slot of slots) {
    if (!workingDays.includes(slot.dayOfWeek)) {
      plan.deactivate.push({ ...summarize(slot), reason: "day_removed" });
      continue;
    }

    const period = byPeriod.get(slot.periodNumber);
    if (!period) {
      plan.deactivate.push({ ...summarize(slot), reason: "period_removed" });
      continue;
    }

    if (period.startTime === slot.startTime && period.endTime === slot.endTime) {
      plan.unchangedCount += 1;
      continue;
    }

    plan.retime.push({ id: slot.id, startTime: period.startTime, endTime: period.endTime });
  }

  return plan;
}

/** True when the plan is a no-op, so the use case can skip the write entirely. */
export function isEmptyPlan(plan: RecomputePlan): boolean {
  return plan.retime.length === 0 && plan.deactivate.length === 0;
}

/**
 * The slots a recompute would MOVE, expressed as candidates to re-check.
 *
 * A branch shifting its day by an hour can walk a shared teacher straight into another
 * branch's period. The exclusion constraint would then reject the UPDATE — correctly,
 * but as a raw database error in the middle of a settings save. Handing these to
 * `findConflicts` first turns that into a report the admin reads before saving.
 */
export function movedSlotsAsCandidates(
  plan: RecomputePlan,
  slots: readonly SlotToRecompute[],
): (SlotToRecompute & { startTime: IsoTime; endTime: IsoTime })[] {
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  return plan.retime.flatMap((moved) => {
    const slot = byId.get(moved.id);
    return slot ? [{ ...slot, startTime: moved.startTime, endTime: moved.endTime }] : [];
  });
}

function summarize(slot: SlotToRecompute) {
  return {
    id: slot.id,
    className: slot.className,
    dayOfWeek: slot.dayOfWeek,
    periodNumber: slot.periodNumber,
  };
}
