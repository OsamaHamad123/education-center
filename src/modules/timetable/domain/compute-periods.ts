import { addMinutesToTime, timeToMinutes, type IsoTime } from "@/shared/lib/time";

/**
 * The bell schedule (PROJECT_PLAN 7.10, 7.11, 10.4).
 *
 * Period times are NOT stored in the settings — they are derived from four numbers:
 * when the day starts, how long a period lasts, how many there are, and where the
 * breaks fall. `timetable_slots` then stores the result, so conflict checking is an
 * index scan rather than a recomputation. That copy is only safe while this function
 * is the single place the times come from, which is why it is pure and tested here.
 */

export type BellBreak = {
  /** The break happens AFTER this period number. */
  afterPeriod: number;
  durationMin: number;
  label: string | null;
};

export type BellSchedule = {
  dayStartTime: IsoTime;
  periodDurationMin: number;
  periodsCount: number;
  breaks: readonly BellBreak[];
};

export type ComputedPeriod = {
  periodNumber: number;
  startTime: IsoTime;
  endTime: IsoTime;
  /** The break that follows this period, if any — so a grid can draw it in place. */
  breakAfter: BellBreak | null;
};

/** The one rule: `start = day_start + Σ(previous durations + breaks)` (rule 10.4). */
export function computePeriods(schedule: BellSchedule): ComputedPeriod[] {
  const breakAfter = breaksByPeriod(schedule.breaks);
  const periods: ComputedPeriod[] = [];

  let cursor = timeToMinutes(schedule.dayStartTime);
  for (let periodNumber = 1; periodNumber <= schedule.periodsCount; periodNumber++) {
    const startTime = minutesFrom(cursor);
    cursor += schedule.periodDurationMin;
    const endTime = minutesFrom(cursor);

    const following = breakAfter.get(periodNumber) ?? null;
    // A break after the LAST period moves nothing, so it never reaches the cursor.
    if (following && periodNumber < schedule.periodsCount) cursor += following.durationMin;

    periods.push({ periodNumber, startTime, endTime, breakAfter: following });
  }

  return periods;
}

/** When the teaching day ends — the end of the last period, breaks included. */
export function dayEndTime(schedule: BellSchedule): IsoTime {
  const periods = computePeriods(schedule);
  const last = periods.at(-1);
  return last ? last.endTime : schedule.dayStartTime;
}

export type BellScheduleViolation =
  "BREAK_AFTER_LAST_PERIOD" | "DUPLICATE_BREAK" | "DAY_OVERFLOWS_MIDNIGHT" | "NO_WORKING_DAYS";

/**
 * Cross-field rules only. Per-field ranges (20–180 minutes, 1–12 periods) are Zod's
 * job and the database's; these are the ones neither can see on its own.
 */
export function validateBellSchedule(
  schedule: BellSchedule & { workingDays: readonly number[] },
): BellScheduleViolation | null {
  if (schedule.workingDays.length === 0) return "NO_WORKING_DAYS";

  const seen = new Set<number>();
  for (const item of schedule.breaks) {
    if (seen.has(item.afterPeriod)) return "DUPLICATE_BREAK";
    seen.add(item.afterPeriod);
    // A break after the last period is not wrong, it is meaningless — and silently
    // ignoring it would leave the admin looking for a change that never appears.
    if (item.afterPeriod >= schedule.periodsCount) return "BREAK_AFTER_LAST_PERIOD";
  }

  // Slot times are `time` columns with no date, so a day that reaches midnight
  // wraps to 00:00 and end_time is suddenly BEFORE start_time — which the CHECK
  // constraint rejects. Ending exactly at 24:00 is therefore out of range too.
  const endMinutes = timeToMinutes(schedule.dayStartTime) + teachingSpanMinutes(schedule);
  if (endMinutes >= 24 * 60) return "DAY_OVERFLOWS_MIDNIGHT";

  return null;
}

/** Only the periods the grid should offer, given the working days of the branch. */
export function isWorkingDay(workingDays: readonly number[], dayOfWeek: number): boolean {
  return workingDays.includes(dayOfWeek);
}

/** Wall-clock minutes from the first bell to the last, breaks included. */
function teachingSpanMinutes(schedule: BellSchedule): number {
  const breaks = schedule.breaks
    .filter((item) => item.afterPeriod < schedule.periodsCount)
    .reduce((sum, item) => sum + item.durationMin, 0);
  return schedule.periodsCount * schedule.periodDurationMin + breaks;
}

function breaksByPeriod(breaks: readonly BellBreak[]): Map<number, BellBreak> {
  return new Map(breaks.map((item) => [item.afterPeriod, item]));
}

function minutesFrom(totalMinutes: number): IsoTime {
  return addMinutesToTime("00:00", totalMinutes);
}
