-- =============================================================================
-- Travel time between branches (§16 question 4; docs/ROADMAP.md, "also open").
--
-- The plan's default was "none in v1", and it held: a teacher double-booked at the
-- same MOMENT has been refused since Phase 6, by a gist exclusion constraint across
-- every branch. What nothing has ever refused is the lesson that ends in Nasr City
-- at 10:30 and the one that starts in El Obour at 10:35 — no overlap, no conflict,
-- and a timetable nobody can actually teach.
--
-- Three decisions:
--
--  1. IT IS OFF UNTIL SOMEBODY SETS IT. `teacher_travel_minutes` defaults to 0, so
--     every existing centre keeps exactly today's behaviour and nothing has to be
--     re-checked. It is a number of minutes rather than a switch because the answer
--     differs by city and the centre is the only one who knows it.
--
--  2. BETWEEN BRANCHES ONLY. Two lessons in the same building are back to back by
--     design — that is what a bell schedule is — and a gap rule there would refuse
--     the ordinary day.
--
--  3. THE GAP IS RETURNED, THE OTHER BRANCH IS NOT. "This teacher has something 15
--     minutes away that you cannot see" says no more than the existing "busy" answer
--     already does, and still names no branch, no class and no student.
--
-- The exclusion constraint stays exactly as it was: it is the guarantee, and this is
-- a rule the centre configures. A travel gap is a scheduling policy, not an
-- impossibility, so it belongs where a human can change it.
-- =============================================================================

ALTER TABLE center_settings
  ADD COLUMN IF NOT EXISTS teacher_travel_minutes integer NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE center_settings
  DROP CONSTRAINT IF EXISTS center_settings_travel_minutes;--> statement-breakpoint

ALTER TABLE center_settings
  ADD CONSTRAINT center_settings_travel_minutes CHECK (teacher_travel_minutes BETWEEN 0 AND 240);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- The conflict lookup, widened.
--
-- A NEW signature rather than a defaulted parameter on the old one: a default would
-- leave both callable and the one-argument call ambiguous, and there is exactly one
-- caller. The old function is dropped in the same migration so there is never a
-- moment when two answers to this question exist.
--
-- `gap_minutes` is 0 for a real overlap and positive for a travel clash, so the
-- caller can tell the two apart without being told anything else about the slot.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS app_timetable_conflicts(jsonb);--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_timetable_conflicts(candidates jsonb, travel_minutes integer)
RETURNS TABLE (
  candidate_index integer,
  slot_id uuid,
  branch_id uuid,
  class_id uuid,
  period_number smallint,
  same_branch boolean,
  class_name text,
  branch_name text,
  gap_minutes integer
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
      coalesce(s.branch_id = app_branch_id(), false) AS same_branch,
      -- 0 when the two actually overlap; otherwise the minutes between them.
      GREATEST(
        0,
        CASE
          WHEN s.start_time >= a.end_time
            THEN EXTRACT(epoch FROM (s.start_time - a.end_time)) / 60
          WHEN a.start_time >= s.end_time
            THEN EXTRACT(epoch FROM (a.start_time - s.end_time)) / 60
          ELSE 0
        END
      )::integer AS gap_minutes,
      -- Not `overlaps`: that is a reserved word in Postgres (the OVERLAPS operator).
      (s.start_time < a.end_time AND a.start_time < s.end_time) AS is_overlap
    FROM asked a
    JOIN timetable_slots s
      ON  s.teacher_id  = a.teacher_id
      AND s.day_of_week = a.day_of_week
      AND s.is_active
      -- Widened by the travel allowance. With 0 minutes this is exactly the old
      -- half-open overlap test: a period ending at 09:30 does not collide with one
      -- starting at 09:30.
      AND s.start_time < a.end_time   + make_interval(mins => travel_minutes)
      AND a.start_time < s.end_time   + make_interval(mins => travel_minutes)
      AND (a.ignore_slot_id IS NULL OR s.id <> a.ignore_slot_id)
    WHERE app_role() IN ('super_admin', 'branch_admin')
  ),
  kept AS (
    -- A widened window also catches same-branch neighbours, which are back to back by
    -- design. Only a real overlap counts inside one building.
    SELECT * FROM found WHERE is_overlap OR NOT same_branch
  )
  SELECT
    f.idx,
    CASE WHEN told THEN f.id END,
    CASE WHEN told THEN f.branch_id END,
    CASE WHEN told THEN f.class_id END,
    CASE WHEN told THEN f.period_number END,
    f.same_branch,
    CASE WHEN told THEN c.name END,
    CASE WHEN told THEN b.name END,
    -- Always told: a number of minutes names nobody.
    f.gap_minutes
  FROM kept f
  CROSS JOIN LATERAL (SELECT f.same_branch OR app_role() = 'super_admin' AS told) t
  LEFT JOIN classes  c ON c.id = f.class_id
  LEFT JOIN branches b ON b.id = f.branch_id
  -- Overlaps first: an impossible booking outranks a tight one.
  ORDER BY f.idx, f.gap_minutes, f.same_branch DESC
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_timetable_conflicts(jsonb, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_timetable_conflicts(jsonb, integer) TO school_app;
