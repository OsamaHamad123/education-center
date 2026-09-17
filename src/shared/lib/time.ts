import { TZDate } from "@date-fns/tz";
import { addMinutes, format, isValid, parse } from "date-fns";
import { type IsoDate } from "./date-display";

/**
 * Every calendar decision in this system happens in Cairo, regardless of where the
 * server or the browser is (CLAUDE.md, "Coding conventions"). Nothing outside this
 * file may call `new Date()` to decide what "today" is.
 */
export const CAIRO_TZ = "Africa/Cairo";

/**
 * The library-free half of this file lives in `date-display.ts`, and is re-exported
 * here so every existing caller carries on unchanged.
 *
 * The split is a measured one: this module imports `date-fns` for the functions that
 * decide what "now" is in Cairo, and any client component importing it — even only to
 * reorder three fields of a date it already has — put the whole library in the browser's
 * bundle, including on the PUBLIC lookup (docs/ROADMAP.md).
 */
export {
  DEFAULT_WORKING_DAYS,
  formatDisplayDate,
  ISO_MONDAY,
  ISO_SATURDAY,
  ISO_SUNDAY,
  isIsoDate,
  isoDayOfWeek,
  isRealIsoDate,
  WEEK_DISPLAY_ORDER,
  type IsoDate,
} from "./date-display";

/** A time of day as stored in a Postgres `time` column: `HH:mm`. */
export type IsoTime = string;

/** Today in Cairo, as `yyyy-MM-dd`. */
export function todayInCairo(now: Date = new Date()): IsoDate {
  return format(new TZDate(now, CAIRO_TZ), "yyyy-MM-dd");
}

/** The current wall-clock time in Cairo, as `HH:mm`. */
export function nowTimeInCairo(now: Date = new Date()): IsoTime {
  return format(new TZDate(now, CAIRO_TZ), "HH:mm");
}

/** Parses `yyyy-MM-dd` into a Date anchored at midnight in Cairo. */
export function parseIsoDate(date: IsoDate): Date {
  const parsed = parse(date, "yyyy-MM-dd", new TZDate(0, CAIRO_TZ));
  if (!isValid(parsed)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return parsed;
}

/**
 * Whether a string is a real calendar day, without throwing (docs/AUDIT-2026-09.md,
 * finding 1).
 *
 * The shape is not enough: `2026-02-31` and `2026-13-01` both match the obvious regex
 * and both make Postgres raise on the cast, which is how a query string became a 500.
 * `parseIsoDate` rejects them because date-fns checks that the parts round-trip.
 */
/** Minutes since midnight for `HH:mm` — the unit period arithmetic works in. */
export function timeToMinutes(time: IsoTime): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid time: ${time}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time: ${time}`);
  }
  return hours * 60 + minutes;
}

/** Inverse of `timeToMinutes`. Wraps within a single day. */
export function minutesToTime(totalMinutes: number): IsoTime {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) {
    throw new Error(`Invalid minute offset: ${totalMinutes}`);
  }
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Adds minutes to a `HH:mm` time. */
export function addMinutesToTime(time: IsoTime, minutes: number): IsoTime {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/** True when two half-open intervals `[start, end)` overlap. */
export function timeRangesOverlap(aStart: IsoTime, aEnd: IsoTime, bStart: IsoTime, bEnd: IsoTime): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

/** Every calendar day in `[from, to]`, inclusive. */
export function eachDayInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start > end) return [];

  const days: IsoDate[] = [];
  for (let cursor = start; cursor <= end; cursor = addMinutes(cursor, 24 * 60)) {
    days.push(format(cursor, "yyyy-MM-dd"));
  }
  return days;
}
