import { formatDisplayDate, isIsoDate } from "./time";

/**
 * Reading and writing a day as `dd/MM/yyyy` (docs/PRODUCT-REVIEW-2026-09.md, finding 1).
 *
 * Pure, and separate from `DateField`, because the format is the part that has to be
 * right: a payroll range read the wrong way round pays the wrong month.
 */

/** ISO in, `dd/MM/yyyy` out. An unusable value shows as empty rather than as itself. */
export function toDisplayDate(value: string): string {
  return isIsoDate(value) ? formatDisplayDate(value) : "";
}

/**
 * `dd/MM/yyyy` in, ISO out — or null while it is still being typed.
 *
 * Accepts `/`, `.` and `-` because people type all three, and single-digit days and
 * months because they type those too.
 */
export function toIsoDate(text: string): string | null {
  const match = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/.exec(text.trim());
  if (!match) return null;

  const [, day, month, year] = match;
  const iso = `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
  // `isIsoDate`, not a range check: 31/02 has the right shape and is not a day.
  return isIsoDate(iso) ? iso : null;
}
