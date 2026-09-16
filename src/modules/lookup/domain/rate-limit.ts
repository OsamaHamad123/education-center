/**
 * The lookup's rate limits (PROJECT_PLAN 10.8).
 *
 * Two windows, keyed differently on purpose:
 *
 *   BY IP    — stops one machine walking the sequential student codes.
 *   BY CODE  — stops a botnet walking the 10,000 possible last-four digits of ONE
 *              child's record. Every request comes from a different address, so a
 *              per-IP limit never sees it. This is the limit that actually protects
 *              a named student.
 *
 * Only FAILURES count towards either. A parent checking three children back to back
 * is not an attack, and a limiter that punishes them will simply be turned off.
 */

export type LookupLimits = {
  maxFailuresPerIp: number;
  ipWindowMinutes: number;
  maxFailuresPerCode: number;
  codeWindowMinutes: number;
};

/** PROJECT_PLAN 10.8: "5 failed attempts per IP per 15 min and per student_code per hour". */
export const LOOKUP_LIMITS: LookupLimits = {
  maxFailuresPerIp: 5,
  ipWindowMinutes: 15,
  maxFailuresPerCode: 5,
  codeWindowMinutes: 60,
};

export type LimitBreach = "IP_BLOCKED" | "CODE_BLOCKED";

export function checkLookupLimits(
  failures: { byIp: number; byCode: number },
  limits: LookupLimits = LOOKUP_LIMITS,
): LimitBreach | null {
  // The IP limit is checked first because it is the cheaper signal and the more
  // common one; both produce the same message to the caller regardless.
  if (failures.byIp >= limits.maxFailuresPerIp) return "IP_BLOCKED";
  if (failures.byCode >= limits.maxFailuresPerCode) return "CODE_BLOCKED";
  return null;
}

/**
 * How long a blocked caller should wait, in minutes. Shown as a rounded hint, never
 * as an exact countdown — an exact one tells an attacker precisely when to resume.
 */
export function retryAfterMinutes(breach: LimitBreach, limits: LookupLimits = LOOKUP_LIMITS): number {
  return breach === "IP_BLOCKED" ? limits.ipWindowMinutes : limits.codeWindowMinutes;
}
