/**
 * Showing and checking a calendar day, with no library behind it.
 *
 * Split out of `time.ts` for one reason, and it is a measured one: `time.ts` imports
 * `date-fns` and `@date-fns/tz` at the top for the functions that decide what "now" is
 * in Cairo. Any client component that imports that module — even only to REORDER three
 * fields of a date it already has — puts the whole library in the browser's bundle, and
 * the public lookup is a page a parent opens on a phone.
 *
 * So the half that needs no library lives here, `time.ts` re-exports it so the other
 * forty files carry on unchanged, and the public pages import it directly.
 *
 * Nothing here decides what today is. That question still has exactly one home.
 */

/** A calendar day as stored in a Postgres `date` column: `yyyy-MM-dd`. */
export type IsoDate = string;

/** ISO weekday numbers. The Egyptian school week runs Saturday → Thursday. */
export const ISO_MONDAY = 1;
export const ISO_SATURDAY = 6;
export const ISO_SUNDAY = 7;

/** Display order of the week in timetables: Saturday first, Friday is the weekend. */
export const WEEK_DISPLAY_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;

/** Default working days of a branch: Saturday → Thursday. */
export const DEFAULT_WORKING_DAYS = [6, 7, 1, 2, 3, 4] as const;

/**
 * Shape, then a REAL calendar day: 2026-02-31 has the right shape and is not a date.
 *
 * `Date.UTC` is arithmetic on a calendar rather than a decision about "now", so it does
 * not break the rule that `time.ts` states — and it is what lets this file have no
 * dependencies at all.
 */
export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const rebuilt = new Date(Date.UTC(year, month - 1, day));
  return (
    rebuilt.getUTCFullYear() === year && rebuilt.getUTCMonth() === month - 1 && rebuilt.getUTCDate() === day
  );
}

/** The same question as a type guard, for values that are not yet known to be dates. */
export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && isRealIsoDate(value);
}

/**
 * `yyyy-MM-dd` → `dd/MM/yyyy` (PROJECT_PLAN section 12).
 *
 * It REFUSES a malformed value rather than guessing at it, which is the contract this
 * has held since Phase 1: a date shown the wrong way round is a payroll range read the
 * wrong way round. `isRealIsoDate` rather than the guard, because the failing branch of
 * a guard on an already-`IsoDate` parameter narrows to `never` and leaves nothing to
 * name in the message.
 */
export function formatDisplayDate(date: IsoDate): string {
  if (!isRealIsoDate(date)) throw new Error(`Invalid ISO date: ${date}`);

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * ISO weekday (1 = Monday … 7 = Sunday) of a calendar day.
 *
 * Library-free for the same reason as the rest of this file, and correct for the same
 * reason: `yyyy-MM-dd` has no time in it, so it names the same weekday in every
 * timezone. This one mattered most — `ar.ts` imports it, every client component imports
 * `ar.ts`, and that single edge put date-fns in the browser bundle of EVERY page.
 */
export function isoDayOfWeek(date: IsoDate): number {
  if (!isRealIsoDate(date)) throw new Error(`Invalid ISO date: ${date}`);

  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // JS getUTCDay() is 0 = Sunday; ISO wants 7 for Sunday.
  return weekday === 0 ? ISO_SUNDAY : weekday;
}
