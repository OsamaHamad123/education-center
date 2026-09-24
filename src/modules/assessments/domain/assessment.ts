/**
 * What makes an assessment valid, and when a parent may see it (`drizzle/0021`).
 *
 * Pure. Read by the create dialog, by the server action and by the publish button, so
 * "this exam is ready" means one thing rather than three.
 */

export type AssessmentKind = "quiz" | "monthly" | "final" | "other";

export type AssessmentViolation = "NAME_REQUIRED" | "MAX_SCORE_INVALID" | "FUTURE_DATE" | "TOO_FAR_BACK";

/** A year. Marks older than that belong to a term nobody is still correcting. */
export const BACKDATE_LIMIT_DAYS = 365;

export function checkAssessment(input: {
  name: string;
  maxScoreHundredths: number;
  assessedOn: string;
  today: string;
}): AssessmentViolation | null {
  if (input.name.trim().length === 0) return "NAME_REQUIRED";
  // Mirrors `assessments_max_score_positive`. The constraint is the guarantee; this
  // is what turns it into an Arabic sentence before anybody hits it.
  if (!Number.isInteger(input.maxScoreHundredths)) return "MAX_SCORE_INVALID";
  if (input.maxScoreHundredths <= 0 || input.maxScoreHundredths > 100_000) return "MAX_SCORE_INVALID";

  // An exam dated next week has not been sat. Recording marks for it is either a typo
  // or a way to publish a result before the paper exists.
  if (input.assessedOn > input.today) return "FUTURE_DATE";
  if (daysBetween(input.assessedOn, input.today) > BACKDATE_LIMIT_DAYS) return "TOO_FAR_BACK";
  return null;
}

export type PublishState = "draft" | "published";

export function publishState(publishedAt: Date | null): PublishState {
  return publishedAt === null ? "draft" : "published";
}

export type PublishViolation = "ALREADY_PUBLISHED" | "NOT_PUBLISHED" | "NOTHING_TO_PUBLISH";

/**
 * Whether an exam may be shown to parents.
 *
 * `NOTHING_TO_PUBLISH` is the one worth having: publishing an exam with no marks in
 * it tells every family in the class that a result exists and shows them nothing,
 * which is worse than saying nothing at all.
 *
 * A partly-marked exam is allowed through deliberately — a child who was absent from
 * school on results day has no row yet, and holding the whole class back for them
 * would mean the exam is never published.
 */
export function checkPublish(input: {
  publishedAt: Date | null;
  scoredCount: number;
  publish: boolean;
}): PublishViolation | null {
  const published = input.publishedAt !== null;
  if (input.publish && published) return "ALREADY_PUBLISHED";
  if (!input.publish && !published) return "NOT_PUBLISHED";
  if (input.publish && input.scoredCount === 0) return "NOTHING_TO_PUBLISH";
  return null;
}

/**
 * Whole days between two `yyyy-MM-dd`, no library.
 *
 * `Date.UTC` on a date with no time in it is calendar arithmetic, not a decision about
 * "now" — the rule `shared/lib/time.ts` states.
 */
function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

function utc(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}
