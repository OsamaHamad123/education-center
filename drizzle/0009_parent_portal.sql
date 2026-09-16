-- =============================================================================
-- The parent portal (docs/PARENT-PORTAL-PLAN.md, phases P1–P3).
--
-- Three decisions are worth reading before the SQL.
--
--  1. NO FOURTH ROLE. Every tenant policy in this system is a positive allowance
--     keyed on `app_role()` and `app_branch_id()`. A parent's scope is neither —
--     it is a set of students sharing one phone — so adding a `parent` role would
--     mean new policies on five tables and a re-audit of all of them. Instead the
--     portal extends the pattern `app_public_lookup` already set: narrow
--     SECURITY DEFINER functions that do their own authorization and never grant
--     the caller a tenant context. The function IS the boundary.
--
--  2. EVERY FUNCTION RE-VERIFIES THE PARENT. A portal session names a parent, and
--     the screens name a student. A student id that arrives from a cookie, a URL or
--     a form is NOT evidence of anything, so each function below takes the parent's
--     phone hash as well and requires the two to match in the same WHERE clause.
--     Tampering with a student id returns nothing, and returns it the same way a
--     wrong one does.
--
--  3. THE PHONE IS NEVER STORED. `portal_sessions` holds a salted hash of the
--     parent's phone and a salted hash of the session token, and nothing else that
--     identifies a person. A stolen backup of this table is a list of hashes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 of the token that lives in the cookie. The token itself is never stored,
  -- so the table cannot be used to sign in as anybody.
  token_hash text NOT NULL UNIQUE,
  -- sha256 of the normalized parent phone. This is the identity; students are looked
  -- up from it every time rather than being pinned into the session.
  parent_phone_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_sessions_token_idx ON portal_sessions (token_hash);
CREATE INDEX IF NOT EXISTS portal_sessions_expiry_idx ON portal_sessions (expires_at);

-- -----------------------------------------------------------------------------
-- Proving a phone: the credential a parent already has.
--
-- The portal deliberately reuses the lookup's credential — a student code and the
-- last four digits of the parent's phone — rather than a one-time code, because a
-- one-time code needs a messaging provider that does not exist yet
-- (docs/PARENT-PORTAL-PLAN.md, Q2). What the portal adds on top is a session, so
-- the credential is typed once a month instead of once a visit.
--
-- It returns the phone HASH, never the phone: the caller gets an identity it can
-- store, and nothing it could read out loud.
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
  WHERE
    -- One predicate, both halves, exactly as app_public_lookup does it: nothing in
    -- the reply tells the caller which half failed.
    s.student_code = target_code
    AND right(s.parent_phone, 4) = last_four
    AND s.status = 'active'
    AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app_portal_verify(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_portal_verify(text, text, text) TO school_app;

-- -----------------------------------------------------------------------------
-- The children behind one phone.
--
-- Siblings come free: two students may carry the same `parent_phone`, and a parent
-- who has proved that phone has proved it for all of them.
--
-- Names are NOT masked here, unlike the anonymous lookup. Masking exists because
-- the lookup answers to anyone holding a code; this answers to a session, and a
-- parent has earned their own child's name. Recorded as a decision, not inferred.
-- -----------------------------------------------------------------------------
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
      AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled)
  ) children;
$$;

REVOKE ALL ON FUNCTION app_portal_children(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_portal_children(text, text) TO school_app;

-- -----------------------------------------------------------------------------
-- One child's attendance over any range the parent asks for.
--
-- `parent_hash` is not decoration. The student id reaches this function from a URL,
-- and a URL is a request, not a permission — so the id and the phone must belong to
-- each other in the same WHERE clause or nothing comes back.
-- -----------------------------------------------------------------------------
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
      AND encode(digest(phone_salt || ':' || s.parent_phone, 'sha256'), 'hex') = parent_hash
      AND s.status = 'active'
      AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled)
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

REVOKE ALL ON FUNCTION app_portal_attendance(uuid, text, text, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_portal_attendance(uuid, text, text, date, date) TO school_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON portal_sessions TO school_app;
