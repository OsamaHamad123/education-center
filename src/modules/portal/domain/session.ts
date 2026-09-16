/**
 * Portal session rules (docs/PARENT-PORTAL-PLAN.md, P1). Pure: no database, no
 * framework, so the arithmetic that decides whether somebody is still signed in is
 * tested once and cannot drift.
 */

export const PORTAL_SESSION = {
  /** Long enough that a parent types the code once a term, short enough to expire. */
  days: 30,
  cookie: "ec.portal",
  /** Bytes of randomness in the token. 32 bytes is 256 bits; guessing is not a threat. */
  tokenBytes: 32,
} as const;

/** When a session created now should stop working. */
export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + PORTAL_SESSION.days * 24 * 60 * 60 * 1000);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * The range a portal screen shows when the parent has not chosen one.
 *
 * The current month, because "was he there this month" is the question people open this
 * for. The screen lets them ask for any range — which the anonymous lookup cannot do,
 * and which is the first thing a parent asks in October about September.
 */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

/**
 * Whether a range is one the portal will answer.
 *
 * A cap, because this is a public endpoint and an uncapped range is an invitation to ask
 * for a decade of one child's records repeatedly. Two years covers any real question a
 * parent has and is cheap to serve.
 */
export const MAX_RANGE_DAYS = 730;

export function rangeIsSane(from: string, to: string): boolean {
  if (from > to) return false;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(days) && days <= MAX_RANGE_DAYS;
}
