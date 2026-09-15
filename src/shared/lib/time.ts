import { TZDate } from "@date-fns/tz";
import { addMinutes, format, isValid, parse } from "date-fns";

/**
 * Every calendar decision in this system happens in Cairo, regardless of where the
 * server or the browser is (CLAUDE.md, "Coding conventions"). Nothing outside this
 * file may call `new Date()` to decide what "today" is.
 */
export const CAIRO_TZ = "Africa/Cairo";

/** ISO weekday numbers. The Egyptian school week runs Saturday → Thursday. */
export const ISO_MONDAY = 1;
export const ISO_SATURDAY = 6;
export const ISO_SUNDAY = 7;

/** Display order of the week in timetables: Saturday first, Friday is the weekend. */
export const WEEK_DISPLAY_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;

/** Default working days of a branch: Saturday → Thursday. */
export const DEFAULT_WORKING_DAYS = [6, 7, 1, 2, 3, 4] as const;

/** A calendar day as stored in a Postgres `date` column: `yyyy-MM-dd`. */
export type IsoDate = string;

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

/** ISO weekday (1 = Monday … 7 = Sunday) of a calendar day. */
export function isoDayOfWeek(date: IsoDate): number {
  const day = parseIsoDate(date).getDay();
  // JS getDay() is 0 = Sunday; ISO wants 7 for Sunday.
  return day === 0 ? ISO_SUNDAY : day;
}

/** Parses `yyyy-MM-dd` into a Date anchored at midnight in Cairo. */
export function parseIsoDate(date: IsoDate): Date {
  const parsed = parse(date, "yyyy-MM-dd", new TZDate(0, CAIRO_TZ));
  if (!isValid(parsed)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return parsed;
}

/** Formats a calendar day for display: `dd/MM/yyyy` (PROJECT_PLAN section 12). */
export function formatDisplayDate(date: IsoDate): string {
  return format(parseIsoDate(date), "dd/MM/yyyy");
}

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
