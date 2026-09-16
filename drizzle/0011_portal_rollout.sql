-- =============================================================================
-- The portal's rollout switches (docs/PARENT-PORTAL-PLAN.md, phase P7).
--
-- P7 is "five hundred families arriving at once, deliberately": staff first, then
-- one branch for a month, then the rest. That plan is not executable with the
-- switches that existed. There was exactly one — `center_settings.lookup_enabled`
-- — and it is shared with the anonymous lookup, so the only way to keep the portal
-- closed to most families was to close the lookup everybody already relies on.
--
-- So two switches, and the difference between them is the difference between
-- "rolling out" and "pulling the cord":
--
--   center_settings.portal_enabled  the master switch, off until the centre says so
--   branches.portal_enabled         which branches are in the rollout, one at a time
--
-- BOTH DEFAULT TO FALSE. A feature that arrives switched on has not been rolled out,
-- it has been released; and a portal that appears at every branch the moment the
-- deploy lands is precisely what P7 exists to prevent. The seed turns the centre
-- switch on and exactly one branch with it, because that is what a centre in the
-- middle of a rollout looks like.
-- =============================================================================

ALTER TABLE center_settings ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE branches ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- The gate, applied in all three functions.
--
--   cs.lookup_enabled   the DATA path. A centre that has told the system to stop
--                       answering parents means both doors, and the portal is the
--                       one that shows the UNMASKED name — it must never be the
--                       door left open when the quieter one is shut.
--   cs.portal_enabled   the portal itself.
--   b.portal_enabled    this branch is in the rollout.
--   b.is_active         and the branch still exists as far as the centre is
--                       concerned. Deactivating a branch is the strongest statement
--                       the centre makes about it; a rollout switch that outlived it
--                       would be a trap set for a year from now.
--
-- Every function re-checks all four. Not one of them trusts a caller to have checked
-- on its behalf, and `app_portal_verify` now joins `branches` for exactly this — a
-- parent whose branch is not in the rollout gets the SAME reply as a wrong code,
-- which is the reply this whole surface gives to everything.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_portal_verify(
  target_code text,
  last_four text,
  phone_salt text
)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT encode(digest(phone_salt || ':' || s.parent_phone, 'sha256'), 'hex')
  FROM students s
  JOIN branches b ON b.id = s.branch_id
  WHERE
    -- One predicate, every half of it, exactly as app_public_lookup does it: nothing
    -- in the reply tells the caller which half failed.
    s.student_code = target_code
    AND right(s.parent_phone, 4) = last_four
    AND s.status = 'active'
    AND b.portal_enabled
    AND b.is_active
    AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled AND cs.portal_enabled)
  LIMIT 1;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_portal_children(parent_hash text, phone_salt text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT coalesce(jsonb_agg(child ORDER BY child->>'fullName'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'studentId', s.id,
      'studentCode', s.student_code,
      'fullName', s.full_name,
      'className', c.name,
      'branchName', b.name
    ) AS child
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN branches b ON b.id = s.branch_id
    WHERE
      encode(digest(phone_salt || ':' || s.parent_phone, 'sha256'), 'hex') = parent_hash
      -- A student who has left is not reachable here. Their record stops being a live
      -- answer the moment they stop attending, exactly as in the lookup.
      AND s.status = 'active'
      -- A family with children at two branches, one of them in the rollout and one
      -- not, sees the one that is. The switch is per branch because the rollout is.
      AND b.portal_enabled
      AND b.is_active
      AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled AND cs.portal_enabled)
  ) children;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_portal_attendance(
  target_student uuid,
  parent_hash text,
  phone_salt text,
  from_date date,
  to_date date
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH allowed AS (
    SELECT s.id, s.full_name, s.student_code, c.name AS class_name, b.name AS branch_name,
           b.phone AS branch_phone, b.address AS branch_address
    FROM students s
    JOIN classes c ON c.id = s.class_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.id = target_student
      -- `parent_hash` is not decoration: the student id reaches this function from a
      -- URL, and a URL is a request, not a permission.
      AND encode(digest(phone_salt || ':' || s.parent_phone, 'sha256'), 'hex') = parent_hash
      AND s.status = 'active'
      AND b.portal_enabled
      AND b.is_active
      AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled AND cs.portal_enabled)
  ),
  marks AS (
    SELECT ar.status, cs.session_date, cs.subject_name, ar.notes
    FROM attendance_records ar
    JOIN class_sessions cs ON cs.id = ar.session_id
    JOIN allowed a ON a.id = ar.student_id
    WHERE cs.status = 'completed'
      AND cs.session_date BETWEEN from_date AND to_date
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM allowed) THEN NULL ELSE jsonb_build_object(
    'fullName', (SELECT full_name FROM allowed),
    'studentCode', (SELECT student_code FROM allowed),
    'className', (SELECT class_name FROM allowed),
    'branchName', (SELECT branch_name FROM allowed),
    'branchPhone', (SELECT branch_phone FROM allowed),
    'branchAddress', (SELECT branch_address FROM allowed),
    'counts', jsonb_build_object(
      'present', (SELECT count(*) FROM marks WHERE status = 'present'),
      'absent',  (SELECT count(*) FROM marks WHERE status = 'absent'),
      'late',    (SELECT count(*) FROM marks WHERE status = 'late'),
      'excused', (SELECT count(*) FROM marks WHERE status = 'excused')
    ),
    'absences', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'date', session_date,
        'status', status,
        'subjectName', subject_name,
        'notes', notes
      ) ORDER BY session_date DESC), '[]'::jsonb)
      FROM marks WHERE status IN ('absent', 'late')
    )
  ) END;
$$;
