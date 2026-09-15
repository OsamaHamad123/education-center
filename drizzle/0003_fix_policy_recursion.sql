-- =============================================================================
-- Breaks an infinite recursion between two RLS policies.
--
-- Migration 0002 let a former branch read a transferred student, via a helper that
-- queries `student_enrollments`. But that query is itself subject to RLS, and
-- `student_enrollments_select` calls `app_student_current_branch()`, which queries
-- `students`, which re-enters `students_select`, which calls the helper again:
--
--   students_select
--     -> app_can_read_student_history()  -> SELECT student_enrollments
--        -> student_enrollments_select
--           -> app_student_current_branch() -> SELECT students
--              -> students_select …
--
-- Postgres stopped it with "stack depth limit exceeded", so it failed CLOSED — every
-- read errored rather than leaking anything — but the students list was unusable.
--
-- The fix is the standard one for RLS helpers that read tables: run them as the
-- function owner so their own reads are not policy-checked, and have them do the
-- authorization themselves. Both functions below are read-only, take a single id,
-- and return either a boolean or one uuid — they cannot be used to pull rows out.
-- `search_path` is pinned because a SECURITY DEFINER function without one can be
-- hijacked by a caller-controlled schema.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_student_current_branch(target_student uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT s.branch_id FROM students s WHERE s.id = target_student $$;
--> statement-breakpoint

-- Still answers only "may I read a branch this student has been enrolled in?", and
-- `app_can_read_branch` reads no tables at all, so the chain now terminates.
CREATE OR REPLACE FUNCTION app_can_read_student_history(target_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$ SELECT exists (
     SELECT 1 FROM student_enrollments e
     WHERE e.student_id = target_student
       AND app_can_read_branch(e.branch_id)
   ) $$;
--> statement-breakpoint

-- SECURITY DEFINER functions are executable by PUBLIC by default; narrow that to the
-- one role that should ever call them.
REVOKE EXECUTE ON FUNCTION app_student_current_branch(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_can_read_student_history(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_student_current_branch(uuid) TO school_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_can_read_student_history(uuid) TO school_app;
