-- =============================================================================
-- The public parent/student lookup (PROJECT_PLAN 10.8).
--
-- This is the only query in the system reachable WITHOUT a session, so it is the
-- only one an attacker can reach without stealing something first. Every decision
-- below is a defence against a specific scenario:
--
--  1. CODE ENUMERATION. Student codes are sequential and printed on every timetable
--     (NSR-26-00001, -00002 …). A response that distinguished "no such student" from
--     "wrong digits" would confirm which codes exist. This function returns NULL for
--     both, from ONE predicate — there is no branch to time, and nothing for the
--     caller to tell apart.
--
--  2. BRUTE FORCE of the last four digits. 10,000 guesses against a known code is an
--     afternoon. The rate limiting that stops it lives in `lookup_attempts`, keyed on
--     BOTH the hashed IP and the student code, so a distributed attack on one child's
--     record is throttled even though every request comes from a different address.
--
--  3. OVER-EXPOSURE to a legitimate parent. Whoever is asking has proved they hold a
--     code and four digits, not that they are a parent. So the document below carries
--     no phone number, no student id, no other student, and no full name — just the
--     first name and a family initial (open question 3, answered by the owner).
--
--  4. THE FEATURE BEING OFF. `lookup_enabled` is checked HERE, not only in the page,
--     so turning it off closes the data path and not merely the door to it.
--
-- SECURITY DEFINER because there is no role to check: `app_role()` is null for an
-- anonymous request, so every RLS policy correctly refuses. This function is the one
-- narrow, audited hole through that floor, and it does its own authorization —
-- the code and the four digits, together, in a single WHERE clause.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_public_lookup(
  target_code text,
  last_four text,
  from_date date,
  to_date date
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH found AS (
    SELECT s.id, s.full_name, s.class_id, s.branch_id
    FROM students s
    WHERE
      -- The whole authorization, in one predicate. Both halves must hold, and the
      -- caller cannot tell which half failed.
      s.student_code = target_code
      AND right(s.parent_phone, 4) = last_four
      -- A student who has left is not publicly reachable; their record stops being
      -- a live answer the moment they stop attending.
      AND s.status = 'active'
      AND (SELECT coalesce(bool_and(cs.lookup_enabled), false) FROM center_settings cs)
    LIMIT 1
  ),
  identity AS (
    SELECT
      f.id,
      -- First name, and the INITIAL of the family name. The full name never leaves
      -- the database, so no application bug can leak it by forgetting to mask.
      split_part(f.full_name, ' ', 1) AS first_name,
      left(
        split_part(f.full_name, ' ', array_length(string_to_array(f.full_name, ' '), 1)),
        1
      ) AS family_initial,
      c.name AS class_name,
      b.name AS branch_name
    FROM found f
    JOIN classes c ON c.id = f.class_id
    JOIN branches b ON b.id = f.branch_id
  ),
  timetable AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'dayOfWeek', t.day_of_week,
          'periodNumber', t.period_number,
          'startTime', to_char(t.start_time, 'HH24:MI'),
          'endTime', to_char(t.end_time, 'HH24:MI'),
          'subjectName', sub.name
        )
        ORDER BY t.day_of_week, t.period_number
      ),
      '[]'::jsonb
    ) AS rows
    FROM found f
    JOIN timetable_slots t ON t.class_id = f.class_id AND t.is_active
    JOIN subjects sub ON sub.id = t.subject_id
  ),
  -- Attendance is counted over two windows: the current Cairo month, and whatever
  -- range the caller asked for (the term, until §16 question 7 gives us terms).
  marks AS (
    SELECT ar.status, cs.session_date
    FROM found f
    JOIN attendance_records ar ON ar.student_id = f.id
    JOIN class_sessions cs ON cs.id = ar.session_id
    -- A cancelled lesson did not happen; an absence recorded against it must not
    -- count against the child (rule 10.5).
    WHERE cs.status = 'completed'
      AND cs.session_date BETWEEN from_date AND to_date
  ),
  counts AS (
    SELECT
      jsonb_build_object(
        'present', count(*) FILTER (WHERE status = 'present'),
        'absent', count(*) FILTER (WHERE status = 'absent'),
        'late', count(*) FILTER (WHERE status = 'late'),
        'excused', count(*) FILTER (WHERE status = 'excused')
      ) AS term,
      jsonb_build_object(
        'present', count(*) FILTER (WHERE status = 'present' AND session_date >= date_trunc('month', app_today_cairo())),
        'absent', count(*) FILTER (WHERE status = 'absent' AND session_date >= date_trunc('month', app_today_cairo())),
        'late', count(*) FILTER (WHERE status = 'late' AND session_date >= date_trunc('month', app_today_cairo())),
        'excused', count(*) FILTER (WHERE status = 'excused' AND session_date >= date_trunc('month', app_today_cairo()))
      ) AS month
    FROM marks
  ),
  absences AS (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(cs.session_date, 'YYYY-MM-DD'),
          'status', ar.status,
          'notes', ar.notes,
          'subjectName', cs.subject_name
        )
        ORDER BY cs.session_date DESC
      ),
      '[]'::jsonb
    ) AS rows
    FROM found f
    JOIN attendance_records ar ON ar.student_id = f.id
    JOIN class_sessions cs ON cs.id = ar.session_id
    WHERE cs.status = 'completed'
      AND cs.session_date BETWEEN from_date AND to_date
      AND ar.status IN ('absent', 'late')
  )
  SELECT jsonb_build_object(
    'firstName', i.first_name,
    'familyInitial', i.family_initial,
    'branchName', i.branch_name,
    'className', i.class_name,
    'timetable', t.rows,
    'termCounts', c.term,
    'monthCounts', c.month,
    'absences', a.rows
  )
  FROM identity i, timetable t, counts c, absences a
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_public_lookup(text, text, date, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_public_lookup(text, text, date, date) TO school_app;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Rate limiting counters (PROJECT_PLAN 7.16, 10.8)
-- -----------------------------------------------------------------------------
-- Two windows, deliberately keyed differently:
--
--   by IP   — stops one machine grinding through codes;
--   by CODE — stops a botnet grinding through one child's four digits, which a
--             per-IP limit alone would never see.
--
-- Only FAILURES count. A parent checking three children in a row is not an attack.
CREATE OR REPLACE FUNCTION app_lookup_failures(
  target_ip_hash text,
  target_code text,
  ip_window interval,
  code_window interval
)
RETURNS TABLE (by_ip integer, by_code integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT
    count(*) FILTER (WHERE la.ip_hash = target_ip_hash AND la.created_at > now() - ip_window)::integer,
    count(*) FILTER (WHERE la.student_code = target_code AND la.created_at > now() - code_window)::integer
  FROM lookup_attempts la
  WHERE NOT la.success
    AND la.created_at > now() - greatest(ip_window, code_window)
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION app_lookup_failures(text, text, interval, interval) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_lookup_failures(text, text, interval, interval) TO school_app;
