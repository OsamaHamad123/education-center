/** Cross-cutting constants. Business rules live in module `domain/`, not here. */

/** Cookie holding the super admin's selected branch (PROJECT_PLAN section 9). */
export const SELECTED_BRANCH_COOKIE = "selected_branch";

/** Value of that cookie meaning "كافة الفروع" — read-only, mutations are blocked. */
export const ALL_BRANCHES = "all";

/** Transaction-local Postgres settings that the RLS policies read (section 8). */
export const PG_SETTINGS = {
  role: "app.user_role",
  branchId: "app.branch_id",
  teacherId: "app.teacher_id",
} as const;

/** Public lookup rate limits (section 10.8). */
export const LOOKUP_LIMITS = {
  maxFailuresPerIp: 5,
  ipWindowMinutes: 15,
  maxAttemptsPerStudentCode: 5,
  studentCodeWindowMinutes: 60,
  /** `lookup_attempts` rows older than this are deleted by the cleanup job. */
  retentionDays: 7,
} as const;

/**
 * Sign-in rate limiting (section 9).
 *
 * A per-IP request budget, not a per-account failure lockout — see the comment in
 * `shared/auth/auth.ts` for why, and docs/PROGRESS.md for the follow-up.
 */
export const LOGIN_LIMITS = {
  maxAttemptsPerIp: 20,
  windowMinutes: 5,
} as const;

/**
 * The per-ACCOUNT half of the same defence (docs/SECURITY-REVIEW.md, finding 1).
 *
 * `LOGIN_LIMITS` above is per address and has to stay generous, because a branch
 * office shares one. This one is keyed on the username, so an attacker spreading
 * guesses across a thousand addresses is throttled exactly as one machine would be.
 *
 * It lives here rather than beside the code that uses it because that file is
 * `"use server"`, and such a file may export nothing but async functions.
 */
export const LOGIN_LOCKOUT = {
  maxFailures: 10,
  windowMinutes: 15,
  /** Nothing older than this is kept; the window is 15 minutes, an hour is ample. */
  retentionMinutes: 60,
} as const;

/** Bounds for the bell schedule (section 7.10). */
export const SCHEDULE_BOUNDS = {
  minPeriodDurationMin: 20,
  maxPeriodDurationMin: 180,
  minPeriodsCount: 1,
  maxPeriodsCount: 12,
} as const;

export const PAGE_SIZE = 25;
