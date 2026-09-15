-- =============================================================================
-- "Link an existing teacher to my branch, by phone" (PROJECT_PLAN section 3).
--
-- A branch admin is allowed to do this, but `teachers_select` shows them only the
-- teachers ALREADY linked to their branch — so the teacher they are trying to link is
-- invisible to them, and the lookup returns nothing. The permission and the policy
-- contradict each other.
--
-- This is the narrowest thing that resolves it: a function that takes a FULL,
-- normalized phone number and returns a single id, or null. It cannot list, cannot
-- search by prefix, and returns no rates, no name and no other branch's data.
--
-- What it does reveal, to someone who already knows a complete phone number, is
-- whether that number belongs to a teacher — which is precisely the question the
-- workflow asks. Once linked, the teacher becomes visible through the normal policy.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_find_active_teacher_by_phone(target_phone text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT t.id FROM teachers t
   WHERE t.phone = target_phone AND t.status = 'active'
   LIMIT 1 $$;
--> statement-breakpoint

-- Only a signed-in admin may ask. A teacher has no reason to, and the public lookup
-- path runs without a role at all.
CREATE OR REPLACE FUNCTION app_lookup_teacher_for_linking(target_phone text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT CASE
     WHEN app_role() IN ('super_admin', 'branch_admin')
     THEN app_find_active_teacher_by_phone(target_phone)
   END $$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_find_active_teacher_by_phone(text) FROM PUBLIC;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_lookup_teacher_for_linking(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_lookup_teacher_for_linking(text) TO school_app;
