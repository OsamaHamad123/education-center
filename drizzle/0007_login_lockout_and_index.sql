-- =============================================================================
-- Finding 1: no per-account lockout on failed sign-ins (docs/SECURITY-REVIEW.md).
--
-- Better Auth counts REQUESTS to the sign-in endpoint, not failures, so the per-IP
-- budget has to stay generous — a branch office shares one address and would lock
-- itself out of its own morning. That left a known username brute-forceable at 20
-- guesses per 5 minutes per address, which is unbounded from a botnet.
--
-- Teacher access codes are SIX DIGITS. A million-space is not a lot to a patient
-- attacker with no per-account limit in the way.
--
-- This table is the per-account counter. Keyed on the USERNAME, deliberately not on
-- the address, so a distributed attack on one account is throttled exactly as a
-- single-host one is. It holds no password, no hash and no address — only the fact
-- that somebody failed, and when.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Lower-cased by the application; Better Auth stores usernames the same way.
  "username" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX "login_attempts_username_created_idx"
  ON "login_attempts" USING btree ("username", "created_at" DESC NULLS LAST);
--> statement-breakpoint

-- No RLS: there is no tenant here, and the row is written BEFORE anybody is
-- authenticated. It carries nothing that identifies a person beyond a username that
-- was already typed into a public form.
GRANT SELECT, INSERT, DELETE ON "login_attempts" TO school_app;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Finding 8: cross-branch date-range reports had no covering index.
-- -----------------------------------------------------------------------------
-- Every branch-scoped query is already covered by (branch_id, session_date), because
-- RLS makes every query branch-scoped. The exception is the super admin's branch
-- comparison, which filters on date alone — and the payroll range scan behind it.
CREATE INDEX IF NOT EXISTS "class_sessions_date_status_idx"
  ON "class_sessions" USING btree ("session_date", "status");
