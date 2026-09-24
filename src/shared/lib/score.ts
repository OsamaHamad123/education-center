/**
 * Marks, as integer hundredths — never floats (`drizzle/0021`).
 *
 * The same rule money follows, for the same reason: 17.5 out of 20 is an ordinary
 * mark in this country, quarter-marks happen, and a total that comes back as
 * 17.499999 is a phone call from a parent. One unit, one place that converts it.
 *
 * Hundredths rather than tenths because a mark out of 3 divided in thirds is a thing
 * teachers actually write, and because the extra digit costs nothing.
 */

export const HUNDREDTHS_PER_MARK = 100;

/** A mark in hundredths: 17.5 is 1750. */
export type Hundredths = number;

/** The largest total the database will accept — `assessments_max_score_positive`. */
export const MAX_SCORE_HUNDREDTHS = 100_000;

/**
 * Parses what somebody typed into a mark field.
 *
 * Returns null rather than throwing, because this runs on a form: a half-typed "1."
 * is not a bug, it is a person still typing. Both the Arabic and the Western decimal
 * separator are accepted — a phone keyboard set to Arabic produces "١٧٫٥".
 */
export function parseScore(input: string): Hundredths | null {
  const normalized = normalizeDigits(input).trim().replace("٫", ".").replace("،", ".");
  if (normalized === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const hundredths = Math.round(value * HUNDREDTHS_PER_MARK);
  return hundredths > MAX_SCORE_HUNDREDTHS ? null : hundredths;
}

/**
 * `1750` → `17.5`, `2000` → `20`.
 *
 * Trailing zeroes are dropped, because "20" is what is written on the paper and
 * "20.00" reads like money.
 */
export function formatScore(hundredths: Hundredths): string {
  assertHundredths(hundredths);
  const whole = Math.trunc(hundredths / HUNDREDTHS_PER_MARK);
  const fraction = hundredths % HUNDREDTHS_PER_MARK;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

/** `17.5 / 20` as a whole percent, rounded. Zero out of zero is not a question. */
export function scorePercent(score: Hundredths, max: Hundredths): number {
  assertHundredths(score);
  assertHundredths(max);
  if (max <= 0) return 0;
  return Math.round((score / max) * 100);
}

/** "17.5 / 20" — the pair, in the order it is written on a paper. */
export function formatOutOf(score: Hundredths, max: Hundredths): string {
  return `${formatScore(score)} / ${formatScore(max)}`;
}

/**
 * Arabic-Indic digits to Western ones.
 *
 * A parent or a teacher on a phone with an Arabic keyboard types ٥١ and means 51.
 * Refusing that is refusing the keyboard half this country uses.
 */
export function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function assertHundredths(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`Score must be an integer in hundredths, got: ${value}`);
  }
}
