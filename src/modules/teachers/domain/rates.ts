/**
 * Teacher rate rules (PROJECT_PLAN 7.7, 7.8, rule 10.6).
 *
 * A teacher is paid per session, at a rate that depends on the class's track. The
 * rate stored on the teacher is only ever the CURRENT one: every session snapshots
 * the rate it was run at, so changing a rate today can never alter what was earned
 * yesterday. These functions decide when a change needs recording, not what payroll
 * is owed.
 */

export type Rates = {
  scientificPiasters: number;
  literaryPiasters: number;
};

export type RateViolation = "NEGATIVE" | "NOT_INTEGER" | "UNREALISTIC";

/** Nobody is paid 20,000 EGP for one session; a typo that large is worth catching. */
const MAX_RATE_PIASTERS = 2_000_000;

export function validateRates(rates: Rates): RateViolation | null {
  for (const value of [rates.scientificPiasters, rates.literaryPiasters]) {
    if (!Number.isInteger(value)) return "NOT_INTEGER";
    if (value < 0) return "NEGATIVE";
    if (value > MAX_RATE_PIASTERS) return "UNREALISTIC";
  }
  return null;
}

/** True when the rates actually moved — an unchanged save should not add history. */
export function ratesChanged(current: Rates, next: Rates): boolean {
  return (
    current.scientificPiasters !== next.scientificPiasters ||
    current.literaryPiasters !== next.literaryPiasters
  );
}

/** The rate a session at this track should snapshot. */
export function rateForTrack(rates: Rates, track: "scientific" | "literary"): number {
  return track === "scientific" ? rates.scientificPiasters : rates.literaryPiasters;
}
