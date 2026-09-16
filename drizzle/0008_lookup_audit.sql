-- =============================================================================
-- Finding 4: successful public lookups were not written to `audit_logs`
-- (docs/SECURITY-REVIEW.md; rule 10.8 requires both that table and this one).
--
-- `audit_logs_insert` is `WITH CHECK (app_role() IS NOT NULL)`, and an anonymous
-- lookup has no role — correctly, because a public endpoint that could write freely
-- into the audit log would let anyone flood the record an administrator relies on.
--
-- So this is a function that writes exactly one shaped row and nothing else. It takes
-- no free text: the action is fixed, the entity is fixed, the id is a student code
-- the caller has already proved they hold, and the IP arrives already hashed. There
-- is no user-controlled field it could be used to smuggle anything through.
--
-- Only SUCCESSFUL lookups reach it, so writing a row already costs a valid code and
-- the right four digits. Failures stay in `lookup_attempts`, where the rate limiter
-- reads them and prunes after seven days.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_record_lookup_audit(target_code text, ip_hash text)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  INSERT INTO audit_logs (branch_id, user_id, action, entity, entity_id, ip)
  -- No branch and no user: a parent belongs to neither, and inventing one would
  -- make the log lie about who acted.
  VALUES (NULL, NULL, 'lookup', 'student.lookup', target_code, ip_hash)
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_record_lookup_audit(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_record_lookup_audit(text, text) TO school_app;
