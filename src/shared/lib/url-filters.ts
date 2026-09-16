import { z } from "zod";
import { isIsoDate } from "./time";

/**
 * Parsing the query string (docs/AUDIT-2026-09.md, findings 1 and 2).
 *
 * A URL is not a submitted form. Nobody filled it in — it was shared in a WhatsApp
 * group, bookmarked a term ago, hand-edited, or written by a date picker that got it
 * wrong once. So a value that makes no sense is treated as a value that was not there:
 * `.catch()` on every field, and the screen renders its default range instead of an
 * error page nobody designed.
 *
 * Before this, `from`, `to` and the three ids went straight from the URL into a `date`
 * or `uuid` comparison. Postgres refused the cast, the throw escaped the page, and
 * eleven URLs answered 500.
 *
 * The pattern is `studentFiltersSchema`'s, which has done this since Phase 4 and is the
 * only reason the students list was not on that list.
 */

/**
 * A calendar day, or undefined. The shape is checked by `isIsoDate`, not by a regex:
 * `2026-02-31` has the right shape and is not a day.
 */
export const dateParam = z
  .string()
  .refine(isIsoDate)
  .optional()
  .catch(() => undefined);

/** An id, or undefined. A malformed one is dropped rather than sent to Postgres. */
export const uuidParam = z.uuid().optional().catch(undefined);

/**
 * The `from`/`to` pair every report and payroll screen takes.
 *
 * An unusable date becomes an absent one, and the caller fills in its own default.
 * That means half a range can survive — `?to=2026-09-10` with no `from` is a real
 * request, and the screens have always answered it — while a nonsense half falls back.
 */
export const dateRangeParams = z.object({ from: dateParam, to: dateParam });

export type DateRangeParams = z.output<typeof dateRangeParams>;

/** Reads a range out of anything, including a raw `searchParams` object. */
export function readDateRange(input: unknown): DateRangeParams {
  return dateRangeParams.parse(input ?? {});
}
