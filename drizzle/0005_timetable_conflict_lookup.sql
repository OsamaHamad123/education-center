-- =============================================================================
-- Friendly timetable conflicts, without leaking another branch (PROJECT_PLAN 7.12).
--
-- `no_teacher_overlap` already makes a double-booked teacher IMPOSSIBLE, in every
-- branch at once. That constraint is the guarantee and nothing here replaces it.
--
-- The problem is the message. A branch admin cannot see `timetable_slots` outside
-- their own branch, so checking for a clash in TypeScript finds nothing, the INSERT
-- goes ahead, and the database answers with `23P01 no_teacher_overlap` — a raw error
-- where the admin needed a sentence.
--
-- This function answers one narrow question: "is this teacher already busy at this
-- moment?" It reads across branches under SECURITY DEFINER, and then REDACTS its own
-- answer before returning it:
--
--   * a super admin oversees every branch, so they are told which branch and class;
--   * a branch admin is told the class only when the clash is in THEIR branch;
--   * otherwise every identifying column comes back NULL — no branch id, no class id,
--     no names. "The teacher is busy" and nothing more.
--
-- The redaction lives here, not only in the application, so a branch admin's server
-- process never holds the other branch's data at all. `redactConflict` in
-- modules/timetable/domain is the second, independent layer over the same rule.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_timetable_conflicts(candidates jsonb)
RETURNS TABLE (
  candidate_index integer,
  slot_id uuid,
  branch_id uuid,
  class_id uuid,
  period_number smallint,
  same_branch boolean,
  class_name text,
  branch_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH asked AS (
    SELECT
      (ordinality - 1)::integer                        AS idx,
      (value ->> 'teacherId')::uuid                    AS teacher_id,
      (value ->> 'dayOfWeek')::smallint                AS day_of_week,
      (value ->> 'startTime')::time                    AS start_time,
      (value ->> 'endTime')::time                      AS end_time,
      nullif(value ->> 'ignoreSlotId', '')::uuid       AS ignore_slot_id
    FROM jsonb_array_elements(candidates) WITH ORDINALITY
  ),
  found AS (
    SELECT
      a.idx,
      s.id,
      s.branch_id,
      s.class_id,
      s.period_number,
      -- A super admin in "كافة الفروع" mode has no branch, so nothing is "same".
      coalesce(s.branch_id = app_branch_id(), false) AS same_branch
    FROM asked a
    JOIN timetable_slots s
      ON  s.teacher_id  = a.teacher_id
      AND s.day_of_week = a.day_of_week
      AND s.is_active
      -- Half-open, exactly like the int4range the exclusion constraint uses: a period
      -- ending at 09:30 does not collide with one starting at 09:30.
      AND s.start_time < a.end_time
      AND a.start_time < s.end_time
      AND (a.ignore_slot_id IS NULL OR s.id <> a.ignore_slot_id)
    -- Only the two admin roles edit timetables; anyone else gets an empty answer.
    WHERE app_role() IN ('super_admin', 'branch_admin')
  )
  SELECT
    f.idx,
    CASE WHEN told THEN f.id END,
    CASE WHEN told THEN f.branch_id END,
    CASE WHEN told THEN f.class_id END,
    CASE WHEN told THEN f.period_number END,
    f.same_branch,
    CASE WHEN told THEN c.name END,
    CASE WHEN told THEN b.name END
  FROM found f
  CROSS JOIN LATERAL (SELECT f.same_branch OR app_role() = 'super_admin' AS told) t
  LEFT JOIN classes  c ON c.id = f.class_id
  LEFT JOIN branches b ON b.id = f.branch_id
  ORDER BY f.idx, f.same_branch DESC
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_timetable_conflicts(jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_timetable_conflicts(jsonb) TO school_app;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Deactivating a slot
-- -----------------------------------------------------------------------------
-- Clearing a cell sets is_active = false; the row stays, because class_sessions
-- reference it (CLAUDE.md: archive, never hard-delete). The UPDATE policy already
-- allows that, but there was no DELETE policy at all — make the absence explicit
-- rather than accidental, so a future DELETE fails loudly instead of quietly.
COMMENT ON TABLE "timetable_slots" IS
  'Weekly plan. Rows are deactivated, never deleted: class_sessions reference them.';
