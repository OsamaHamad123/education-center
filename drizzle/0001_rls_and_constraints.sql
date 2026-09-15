-- =============================================================================
-- Branch isolation: Row Level Security, plus the constraints Drizzle cannot express.
-- PROJECT_PLAN section 8. This is the security boundary of the whole product.
--
-- Read this file as answering one question per table: "which rows may the role in
-- app.user_role see, and which may it write?" Everything the application does runs
-- as school_app (NOBYPASSRLS) inside withTenant(), so a forgotten branch_id filter
-- in TypeScript returns zero rows instead of leaking another branch's data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Teacher overlap across ALL branches (PROJECT_PLAN 7.12)
-- -----------------------------------------------------------------------------
-- A teacher physically cannot be in two classrooms at once, even in two different
-- branches. int4range is half-open, so a period ending at 09:30 and one starting at
-- 09:30 do not conflict.
ALTER TABLE "timetable_slots"
  ADD COLUMN "minute_range" int4range
  GENERATED ALWAYS AS (
    int4range(
      extract(hour from start_time)::int * 60 + extract(minute from start_time)::int,
      extract(hour from end_time)::int * 60 + extract(minute from end_time)::int
    )
  ) STORED;
--> statement-breakpoint

ALTER TABLE "timetable_slots"
  ADD CONSTRAINT "no_teacher_overlap"
  EXCLUDE USING gist (teacher_id WITH =, day_of_week WITH =, minute_range WITH &&)
  WHERE (is_active);
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 2. Helper functions reading the transaction-local settings set by withTenant()
-- -----------------------------------------------------------------------------
-- The `true` second argument to current_setting means "return null if unset" rather
-- than raising, so a query that somehow runs outside withTenant() sees nothing.
CREATE OR REPLACE FUNCTION app_role() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_role', true), '') $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_branch_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.branch_id', true), '')::uuid $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_teacher_id() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.teacher_id', true), '')::uuid $$;
--> statement-breakpoint

-- True when the current teacher is linked to, and active in, the given branch.
CREATE OR REPLACE FUNCTION app_teacher_in_branch(target_branch uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT exists (
     SELECT 1 FROM teacher_branches tb
     WHERE tb.teacher_id = app_teacher_id()
       AND tb.branch_id = target_branch
       AND tb.is_active
   ) $$;
--> statement-breakpoint

-- Today in Cairo. Teachers may only mark attendance for the current day (rule 10.5),
-- and "current day" must not depend on the server's clock zone.
CREATE OR REPLACE FUNCTION app_today_cairo() RETURNS date LANGUAGE sql STABLE AS
$$ SELECT (now() AT TIME ZONE 'Africa/Cairo')::date $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_teacher_marking_enabled() RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT coalesce((SELECT teacher_can_mark_attendance FROM center_settings LIMIT 1), false) $$;
--> statement-breakpoint

-- A branch admin reads exactly one branch. A super admin reads every branch.
--
-- The branch switcher is a VIEW FILTER for a super admin, not a permission: they can
-- change it themselves at any time, so scoping their reads here would buy no security.
-- Scoping it here actively broke things, because under FORCE ROW LEVEL SECURITY
-- PostgreSQL applies the SELECT policy to the NEW row of an UPDATE — a super admin
-- scoped to branch A could therefore not transfer a student INTO branch B (rule 10.3),
-- nor even see branch B's classes to pick a target. Cross-branch reports (10.7) hit
-- the same wall. So: super admins read everything here, and `queries/*` apply the
-- selected branch as an ordinary WHERE clause.
--
-- What the switcher still controls is WRITES — see app_can_write_branch below, which
-- requires a specific branch and so keeps "كافة الفروع" read-only.
CREATE OR REPLACE FUNCTION app_can_read_branch(target_branch uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT (app_role() = 'super_admin')
       OR (app_role() = 'branch_admin' AND target_branch = app_branch_id()) $$;
--> statement-breakpoint

-- Writing always requires one specific branch, which is why "كافة الفروع" cannot mutate.
CREATE OR REPLACE FUNCTION app_can_write_branch(target_branch uuid) RETURNS boolean
LANGUAGE sql STABLE AS
$$ SELECT app_role() IN ('super_admin', 'branch_admin')
      AND app_branch_id() IS NOT NULL
      AND target_branch = app_branch_id() $$;
--> statement-breakpoint

-- The student's CURRENT branch. A transferred student's history must follow them to
-- the new branch (PROJECT_PLAN section 8), so several policies join through this.
CREATE OR REPLACE FUNCTION app_student_current_branch(target_student uuid) RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT s.branch_id FROM students s WHERE s.id = target_student $$;
--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 3. branches
-- -----------------------------------------------------------------------------
-- A branch admin must not even learn that other branches exist: no dropdown, no
-- count, no name in an error message (CLAUDE.md, "Multi-branch isolation").
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "branches_select" ON "branches" FOR SELECT USING (
  app_role() = 'super_admin'
  OR (app_role() = 'branch_admin' AND id = app_branch_id())
  OR (app_role() = 'teacher' AND app_teacher_in_branch(id))
);--> statement-breakpoint

CREATE POLICY "branches_insert" ON "branches" FOR INSERT WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "branches_update" ON "branches" FOR UPDATE
  USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 4. subjects — a global list, readable by everyone, writable by the super admin
-- -----------------------------------------------------------------------------
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "subjects_select" ON "subjects" FOR SELECT USING (app_role() IS NOT NULL);--> statement-breakpoint
CREATE POLICY "subjects_insert" ON "subjects" FOR INSERT WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "subjects_update" ON "subjects" FOR UPDATE
  USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 5. center_settings — one row, read by everyone, written by the super admin
-- -----------------------------------------------------------------------------
ALTER TABLE "center_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "center_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "center_settings_select" ON "center_settings" FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY "center_settings_insert" ON "center_settings" FOR INSERT
  WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "center_settings_update" ON "center_settings" FOR UPDATE
  USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 6. classes
-- -----------------------------------------------------------------------------
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "classes_select" ON "classes" FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND app_teacher_in_branch(branch_id))
);--> statement-breakpoint

CREATE POLICY "classes_insert" ON "classes" FOR INSERT WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
CREATE POLICY "classes_update" ON "classes" FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 7. students
-- -----------------------------------------------------------------------------
-- Teachers need the roster of the classes they teach in order to mark attendance,
-- so they read students of branches they are linked to.
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "students_select" ON "students" FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND app_teacher_in_branch(branch_id))
);--> statement-breakpoint

CREATE POLICY "students_insert" ON "students" FOR INSERT WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- A transfer moves branch_id, so the USING clause matches the OLD branch and the
-- WITH CHECK clause the NEW one. Only a super admin may cross that line
-- (rule 10.3): a branch admin's USING and WITH CHECK are both their own branch,
-- which makes a transfer out impossible for them.
CREATE POLICY "students_update" ON "students" FOR UPDATE
  USING (
    app_can_write_branch(branch_id)
    OR (app_role() = 'super_admin' AND app_branch_id() IS NOT NULL)
  )
  WITH CHECK (
    app_can_write_branch(branch_id)
    OR (app_role() = 'super_admin' AND app_branch_id() IS NOT NULL)
  );--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 8. student_enrollments — the archive follows the student
-- -----------------------------------------------------------------------------
ALTER TABLE "student_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_enrollments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "student_enrollments_select" ON "student_enrollments" FOR SELECT USING (
  app_can_read_branch(branch_id)
  -- The student's current branch sees the whole history, including rows recorded
  -- by the branch they transferred from.
  OR app_can_read_branch(app_student_current_branch(student_id))
  OR (app_role() = 'teacher' AND app_teacher_in_branch(branch_id))
);--> statement-breakpoint

CREATE POLICY "student_enrollments_insert" ON "student_enrollments" FOR INSERT WITH CHECK (
  app_can_write_branch(branch_id)
  OR (app_role() = 'super_admin' AND app_branch_id() IS NOT NULL)
);--> statement-breakpoint

CREATE POLICY "student_enrollments_update" ON "student_enrollments" FOR UPDATE
  USING (
    app_can_write_branch(branch_id)
    OR (app_role() = 'super_admin' AND app_branch_id() IS NOT NULL)
  )
  WITH CHECK (
    app_can_write_branch(branch_id)
    OR (app_role() = 'super_admin' AND app_branch_id() IS NOT NULL)
  );--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 9. student_code_counters
-- -----------------------------------------------------------------------------
ALTER TABLE "student_code_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_code_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "student_code_counters_select" ON "student_code_counters" FOR SELECT
  USING (app_can_read_branch(branch_id));--> statement-breakpoint
CREATE POLICY "student_code_counters_insert" ON "student_code_counters" FOR INSERT
  WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
CREATE POLICY "student_code_counters_update" ON "student_code_counters" FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 10. teachers — a global profile with per-role visibility
-- -----------------------------------------------------------------------------
-- A branch admin sees only teachers linked to their branch, and cannot edit rates
-- (PROJECT_PLAN section 3). A teacher sees only themselves.
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teachers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "teachers_select" ON "teachers" FOR SELECT USING (
  app_role() = 'super_admin'
  OR (app_role() = 'branch_admin' AND exists (
        SELECT 1 FROM teacher_branches tb
        WHERE tb.teacher_id = teachers.id AND tb.branch_id = app_branch_id() AND tb.is_active))
  OR (app_role() = 'teacher' AND id = app_teacher_id())
);--> statement-breakpoint

CREATE POLICY "teachers_insert" ON "teachers" FOR INSERT WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "teachers_update" ON "teachers" FOR UPDATE
  USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 11. teacher_branches
-- -----------------------------------------------------------------------------
ALTER TABLE "teacher_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teacher_branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "teacher_branches_select" ON "teacher_branches" FOR SELECT USING (
  app_role() = 'super_admin'
  OR (app_role() = 'branch_admin' AND branch_id = app_branch_id())
  OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
);--> statement-breakpoint

CREATE POLICY "teacher_branches_insert" ON "teacher_branches" FOR INSERT
  WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
CREATE POLICY "teacher_branches_update" ON "teacher_branches" FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 12. teacher_rate_history — money history is super-admin only
-- -----------------------------------------------------------------------------
ALTER TABLE "teacher_rate_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teacher_rate_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "teacher_rate_history_select" ON "teacher_rate_history" FOR SELECT
  USING (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY "teacher_rate_history_insert" ON "teacher_rate_history" FOR INSERT
  WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 13. branch_schedule_settings and branch_breaks
-- -----------------------------------------------------------------------------
ALTER TABLE "branch_schedule_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branch_schedule_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "branch_schedule_settings_select" ON "branch_schedule_settings" FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND app_teacher_in_branch(branch_id))
);--> statement-breakpoint
CREATE POLICY "branch_schedule_settings_insert" ON "branch_schedule_settings" FOR INSERT
  WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
CREATE POLICY "branch_schedule_settings_update" ON "branch_schedule_settings" FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

ALTER TABLE "branch_breaks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "branch_breaks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Breaks have no branch_id of their own; they inherit the scope of their settings row.
CREATE POLICY "branch_breaks_select" ON "branch_breaks" FOR SELECT USING (
  exists (SELECT 1 FROM branch_schedule_settings s
          WHERE s.id = branch_breaks.settings_id
            AND (app_can_read_branch(s.branch_id)
                 OR (app_role() = 'teacher' AND app_teacher_in_branch(s.branch_id))))
);--> statement-breakpoint
CREATE POLICY "branch_breaks_insert" ON "branch_breaks" FOR INSERT WITH CHECK (
  exists (SELECT 1 FROM branch_schedule_settings s
          WHERE s.id = branch_breaks.settings_id AND app_can_write_branch(s.branch_id))
);--> statement-breakpoint
CREATE POLICY "branch_breaks_update" ON "branch_breaks" FOR UPDATE USING (
  exists (SELECT 1 FROM branch_schedule_settings s
          WHERE s.id = branch_breaks.settings_id AND app_can_write_branch(s.branch_id))
);--> statement-breakpoint
CREATE POLICY "branch_breaks_delete" ON "branch_breaks" FOR DELETE USING (
  exists (SELECT 1 FROM branch_schedule_settings s
          WHERE s.id = branch_breaks.settings_id AND app_can_write_branch(s.branch_id))
);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 14. timetable_slots
-- -----------------------------------------------------------------------------
ALTER TABLE "timetable_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "timetable_slots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- A teacher sees their own slots in every branch they work in, plus the timetable of
-- the branches they are linked to (they need the grid to know where to be).
CREATE POLICY "timetable_slots_select" ON "timetable_slots" FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND (teacher_id = app_teacher_id() OR app_teacher_in_branch(branch_id)))
);--> statement-breakpoint

CREATE POLICY "timetable_slots_insert" ON "timetable_slots" FOR INSERT
  WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
CREATE POLICY "timetable_slots_update" ON "timetable_slots" FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 15. class_sessions
-- -----------------------------------------------------------------------------
ALTER TABLE "class_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "class_sessions_select" ON "class_sessions" FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
);--> statement-breakpoint

-- A teacher may create a session only for themselves, only today, and only while the
-- center setting allows it (rule 10.5). Admins have no such restriction here; the
-- edit window for past attendance is enforced in the use case, where it can produce
-- an Arabic message instead of a bare zero-rows result.
CREATE POLICY "class_sessions_insert" ON "class_sessions" FOR INSERT WITH CHECK (
  app_can_write_branch(branch_id)
  OR (app_role() = 'teacher'
      AND teacher_id = app_teacher_id()
      AND session_date = app_today_cairo()
      AND app_teacher_in_branch(branch_id)
      AND app_teacher_marking_enabled())
);--> statement-breakpoint

CREATE POLICY "class_sessions_update" ON "class_sessions" FOR UPDATE
  USING (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher'
        AND teacher_id = app_teacher_id()
        AND session_date = app_today_cairo()
        AND app_teacher_marking_enabled())
  )
  WITH CHECK (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher'
        AND teacher_id = app_teacher_id()
        AND session_date = app_today_cairo()
        AND app_teacher_marking_enabled())
  );--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 16. attendance_records
-- -----------------------------------------------------------------------------
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "attendance_records_select" ON "attendance_records" FOR SELECT USING (
  app_can_read_branch(branch_id)
  -- Attendance recorded before a transfer stays visible to the student's new branch,
  -- so the profile shows one continuous history (PROJECT_PLAN section 8).
  OR app_can_read_branch(app_student_current_branch(student_id))
  OR (app_role() = 'teacher' AND exists (
        SELECT 1 FROM class_sessions cs
        WHERE cs.id = attendance_records.session_id AND cs.teacher_id = app_teacher_id()))
);--> statement-breakpoint

CREATE POLICY "attendance_records_insert" ON "attendance_records" FOR INSERT WITH CHECK (
  app_can_write_branch(branch_id)
  OR (app_role() = 'teacher' AND app_teacher_marking_enabled() AND exists (
        SELECT 1 FROM class_sessions cs
        WHERE cs.id = attendance_records.session_id
          AND cs.teacher_id = app_teacher_id()
          AND cs.session_date = app_today_cairo()))
);--> statement-breakpoint

CREATE POLICY "attendance_records_update" ON "attendance_records" FOR UPDATE
  USING (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher' AND app_teacher_marking_enabled() AND exists (
          SELECT 1 FROM class_sessions cs
          WHERE cs.id = attendance_records.session_id
            AND cs.teacher_id = app_teacher_id()
            AND cs.session_date = app_today_cairo()))
  )
  WITH CHECK (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher' AND app_teacher_marking_enabled() AND exists (
          SELECT 1 FROM class_sessions cs
          WHERE cs.id = attendance_records.session_id
            AND cs.teacher_id = app_teacher_id()
            AND cs.session_date = app_today_cairo()))
  );--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 17. audit_logs — append-only
-- -----------------------------------------------------------------------------
-- Anyone may append; only admins may read, and only their own branch's entries.
-- There is deliberately no UPDATE or DELETE policy, and no grant for either.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "audit_logs_select" ON "audit_logs" FOR SELECT USING (
  app_role() = 'super_admin'
  OR (app_role() = 'branch_admin' AND branch_id = app_branch_id())
);--> statement-breakpoint

CREATE POLICY "audit_logs_insert" ON "audit_logs" FOR INSERT WITH CHECK (app_role() IS NOT NULL);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 18. user — defence in depth around the Better Auth tables
-- -----------------------------------------------------------------------------
-- Login happens before any tenant context exists, so `app_role() IS NULL` has to be
-- allowed: that is the authentication code path. Every application query runs inside
-- withTenant(), where app_role() is always set, and is scoped by the clauses below.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "user_select" ON "user" FOR SELECT USING (
  app_role() IS NULL
  OR app_role() = 'super_admin'
  OR (app_role() = 'branch_admin' AND branch_id = app_branch_id())
  OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
);--> statement-breakpoint

CREATE POLICY "user_insert" ON "user" FOR INSERT WITH CHECK (
  app_role() IS NULL OR app_role() = 'super_admin'
);--> statement-breakpoint

CREATE POLICY "user_update" ON "user" FOR UPDATE USING (
  app_role() IS NULL
  OR app_role() = 'super_admin'
  OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
);--> statement-breakpoint

-- session, account and verification are keyed by user id and are managed entirely by
-- Better Auth, which runs outside a tenant context. They stay unrestricted by RLS and
-- are protected by the application layer; see docs/PROGRESS.md.

-- -----------------------------------------------------------------------------
-- 19. Grants for school_app
-- -----------------------------------------------------------------------------
-- No DELETE on students, enrollments, sessions, attendance or audit logs: this
-- system archives, it does not erase (CLAUDE.md, "Coding conventions").
GRANT SELECT, INSERT, UPDATE ON
  branches, subjects, center_settings, classes, students, student_enrollments,
  student_code_counters, teachers, teacher_branches, teacher_rate_history,
  branch_schedule_settings, timetable_slots, class_sessions, attendance_records
TO school_app;--> statement-breakpoint

-- Breaks are genuinely removed when a bell schedule is edited.
GRANT SELECT, INSERT, UPDATE, DELETE ON branch_breaks TO school_app;--> statement-breakpoint

GRANT SELECT, INSERT ON audit_logs TO school_app;--> statement-breakpoint

-- The lookup rate limiter inserts on every attempt and prunes rows older than 7 days.
GRANT SELECT, INSERT, DELETE ON lookup_attempts TO school_app;--> statement-breakpoint

-- Better Auth manages its own lifecycle, including deleting sessions on logout.
GRANT SELECT, INSERT, UPDATE ON "user" TO school_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON session, account, verification TO school_app;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION
  app_role(), app_branch_id(), app_teacher_id(), app_teacher_in_branch(uuid),
  app_today_cairo(), app_teacher_marking_enabled(), app_can_read_branch(uuid),
  app_can_write_branch(uuid), app_student_current_branch(uuid)
TO school_app;--> statement-breakpoint

-- Future tables must be granted explicitly. Not setting default privileges here is
-- deliberate: a new table should be invisible until someone has written its policy.
