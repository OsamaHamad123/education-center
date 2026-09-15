import type { ComputedPeriod } from "./compute-periods";
import type { PlannedSlot } from "./conflicts";

/**
 * Copying a week from one class to another (PROJECT_PLAN section 14, Phase 6).
 *
 * The obvious implementation — duplicate the rows with a new class_id — is wrong the
 * moment the two classes are on different tracks, because علمي and أدبي have their own
 * bell schedules. The copy therefore carries the SHAPE of the week (day, period,
 * subject, teacher) and re-derives the times from the target's own schedule.
 *
 * Anything that does not fit is skipped and reported rather than silently dropped.
 */

export type SourceSlot = {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  dayOfWeek: number;
  periodNumber: number;
};

export type CopyCandidate = PlannedSlot & { subjectId: string; subjectName: string };

export type CopySkip = {
  subjectName: string;
  dayOfWeek: number;
  periodNumber: number;
  reason: "period_missing" | "day_not_working" | "cell_occupied" | "teacher_not_in_branch" | "teacher_busy";
};

export type CopyPlan = {
  create: CopyCandidate[];
  skipped: CopySkip[];
};

export function planCopy(input: {
  source: readonly SourceSlot[];
  targetClassId: string;
  targetPeriods: readonly ComputedPeriod[];
  targetWorkingDays: readonly number[];
  /** Cells already filled in the target class, as `day:period`. Never overwritten. */
  occupied: ReadonlySet<string>;
  /** Teachers linked to the target class's branch; others cannot teach there. */
  teachersInBranch: ReadonlySet<string>;
}): CopyPlan {
  const byPeriod = new Map(input.targetPeriods.map((period) => [period.periodNumber, period]));
  const plan: CopyPlan = { create: [], skipped: [] };
  // A copy is one action, so two source slots landing on one cell must not both be
  // created — the first wins and the second is reported like any other collision.
  const claimed = new Set(input.occupied);

  for (const slot of input.source) {
    const where = {
      subjectName: slot.subjectName,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
    };

    if (!input.targetWorkingDays.includes(slot.dayOfWeek)) {
      plan.skipped.push({ ...where, reason: "day_not_working" });
      continue;
    }

    const period = byPeriod.get(slot.periodNumber);
    if (!period) {
      plan.skipped.push({ ...where, reason: "period_missing" });
      continue;
    }

    const cell = cellKey(slot.dayOfWeek, slot.periodNumber);
    if (claimed.has(cell)) {
      plan.skipped.push({ ...where, reason: "cell_occupied" });
      continue;
    }

    if (!input.teachersInBranch.has(slot.teacherId)) {
      plan.skipped.push({ ...where, reason: "teacher_not_in_branch" });
      continue;
    }

    claimed.add(cell);
    plan.create.push({
      classId: input.targetClassId,
      teacherId: slot.teacherId,
      subjectId: slot.subjectId,
      subjectName: slot.subjectName,
      dayOfWeek: slot.dayOfWeek,
      periodNumber: slot.periodNumber,
      startTime: period.startTime,
      endTime: period.endTime,
    });
  }

  return plan;
}

export function cellKey(dayOfWeek: number, periodNumber: number): string {
  return `${dayOfWeek}:${periodNumber}`;
}
