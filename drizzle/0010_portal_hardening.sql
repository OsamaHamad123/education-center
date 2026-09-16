-- =============================================================================
-- Hardening the parent portal (docs/PARENT-PORTAL-PLAN.md, phase P6;
-- docs/PORTAL-REVIEW-2026-09.md, findings 2, 5 and 6).
--
-- P1–P3 built the portal. This migration is the review of it, and it changes the
-- database in three places.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Finding 2: `portal_sessions` was readable by every staff query.
--
-- The table has no `branch_id` and its rows belong to no tenant, so the Phase 1
-- reasoning — "not tenant data, therefore no RLS" — was applied to it the way it
-- was applied to `login_attempts`. That was the wrong comparison. `login_attempts`
-- holds a username somebody already typed into a public form. This table holds a
-- LIVE SESSION TOKEN HASH and a parent's phone hash, and `school_app` had a blanket
-- SELECT on it, which means every staff-facing query in the product could read every
-- parent's session. One mistaken join, or one injection anywhere in the admin
-- surface, and the whole portal's session table comes out with it.
--
-- There is no tenant to key a policy on — but there is something better. The portal
-- is the ONLY caller, and it is the only part of the system that runs OUTSIDE
-- `withTenant`: it has no role, by design, because a parent is not staff. Every staff
-- query is inside `withTenant` and therefore has `app.user_role` set. So the policy
-- is exactly that: this table is visible only to a statement with NO tenant role.
--
-- The effect is structural rather than procedural. It is not that staff queries are
-- not supposed to read portal sessions; it is that they cannot.
--
-- FORCE, so it binds the owner too. Migrations and the seed set no role either, so
-- they still pass — the policy asks about the tenant context, not about the login.
-- -----------------------------------------------------------------------------
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE portal_sessions FORCE ROW LEVEL SECURITY;--> statement-breakpoint

DROP POLICY IF EXISTS portal_sessions_no_tenant ON portal_sessions;--> statement-breakpoint
CREATE POLICY portal_sessions_no_tenant ON portal_sessions
  FOR ALL
  USING (app_role() IS NULL)
  WITH CHECK (app_role() IS NULL);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Finding 6: a grant and a column for a function nobody called.
--
-- `touchSession` was written, exported, and never used once. `last_seen_at` was
-- therefore always equal to `created_at` — a column that claims to know when a parent
-- last used the portal and does not. A column nobody writes is not data, it is a
-- claim, and the UPDATE grant it justified was privilege the app never needed.
--
-- P7 wants to know how many families actually use this. `created_at` and `expires_at`
-- already answer that, and if a real usage figure is wanted it should be added
-- deliberately, with the write it costs, rather than inherited from a stub.
-- -----------------------------------------------------------------------------
ALTER TABLE portal_sessions DROP COLUMN IF EXISTS last_seen_at;--> statement-breakpoint
REVOKE UPDATE ON portal_sessions FROM school_app;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Finding 5: the portal wrote nothing to `audit_logs`.
--
-- The anonymous lookup has been audited since SECURITY-REVIEW finding 4, and the
-- lookup shows a MASKED name. The portal shows the child's full name, and it left no
-- trace at all — so the newer and more revealing door was the one an administrator
-- could not ask questions about.
--
-- Same shape as `app_record_lookup_audit`, and the same reasoning: `audit_logs_insert`
-- is `WITH CHECK (app_role() IS NOT NULL)` and a parent has no role, so the hole is a
-- function that writes one fixed row and takes no free text. `action` is 'login'
-- rather than a new enum value — a portal sign-in IS a login — and the entity says
-- which door it came through, so the two are never confused in the log.
--
-- Only a SUCCESSFUL sign-in reaches it. Failures stay in `lookup_attempts` where the
-- rate limiter reads them; auditing failures would let anybody flood the record.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_record_portal_audit(target_code text, ip_hash text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  -- No branch and no user: a parent belongs to neither, and inventing one would make
  -- the log lie about who acted.
  INSERT INTO audit_logs (branch_id, user_id, action, entity, entity_id, ip)
  VALUES (NULL, NULL, 'login', 'student.portal', target_code, ip_hash)
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_record_portal_audit(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_record_portal_audit(text, text) TO school_app;
