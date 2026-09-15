-- =============================================================================
-- A branch keeps a read-only view of students who transferred OUT of it.
-- PROJECT_PLAN rule 10.3: "Old branch keeps a read-only 'transferred out' entry in
-- its list filter."
--
-- Until now `students_select` matched only the student's CURRENT branch, so the
-- moment a super admin moved a student, the branch that had taught them for two
-- years lost the name attached to its own attendance history.
--
-- This widens SELECT — and only SELECT — to any branch that once enrolled them. It
-- is not a hole: `student_enrollments` already grants exactly this visibility, and a
-- branch cannot see a student it never taught. Writing stays on the current branch,
-- so the old branch can look but not touch.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_can_read_student_history(target_student uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT exists (
     SELECT 1 FROM student_enrollments e
     WHERE e.student_id = target_student
       AND app_can_read_branch(e.branch_id)
   ) $$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION app_can_read_student_history(uuid) TO school_app;--> statement-breakpoint

DROP POLICY IF EXISTS "students_select" ON "students";--> statement-breakpoint

CREATE POLICY "students_select" ON "students" FOR SELECT USING (
  app_can_read_branch(branch_id)
  -- A branch that once enrolled this student may still read their record.
  OR app_can_read_student_history(id)
  OR (app_role() = 'teacher' AND app_teacher_in_branch(branch_id))
);
