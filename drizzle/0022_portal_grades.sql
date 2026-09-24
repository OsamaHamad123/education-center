-- =============================================================================
-- الدرجات في بوابة ولي الأمر (asked for 2026-09-24).
--
-- The second half of the road the fee ledger took: `drizzle/0021` built grades in
-- the centre's own product, and this opens one capped, redacted window onto them
-- for a parent who is signed in. Nothing else about the portal changes.
--
-- It is `app_portal_balance` with a different payload, deliberately — same shape,
-- same guard, same cap — because a portal function that is written a new way each
-- time is a portal function somebody eventually writes wrong.
--
-- What it will NOT return, each for a reason:
--
--   THE CLASS AVERAGE OR A RANK. The centre chose this on 2026-09-24. A portal
--   that ranks children is a portal families use to compare children, and the
--   support calls that follow are not about software.
--
--   AN UNPUBLISHED ASSESSMENT. `published_at IS NOT NULL` is in the predicate, not
--   in the application, so a half-marked paper cannot reach a parent by any route.
--
--   THE TEACHER'S NOTE ON THE MARK. `assessment_scores.notes` is the centre's note
--   to itself — the same call `drizzle/0014` made about a discount's reason.
--
-- The `/lookup` page is untouched: it has no session and no audit trail, and the
-- centre chose to keep marks behind the portal's front door.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_portal_grades(
  target_student uuid,
  parent_hash text,
  phone_salt text
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH allowed AS (
    -- Byte for byte the guard every other `app_portal_*` function uses: the child
    -- must belong to this phone, be active, and sit in a branch whose portal the
    -- centre has actually opened.
    SELECT s.id
    FROM students s
    JOIN branches b ON b.id = s.branch_id
    WHERE s.id = target_student
      AND encode(digest(phone_salt || ':' || s.parent_phone, 'sha256'), 'hex') = parent_hash
      AND s.status = 'active'
      AND b.portal_enabled
      AND b.is_active
      AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled AND cs.portal_enabled)
  ),
  marks AS (
    SELECT
      a.name,
      a.kind::text            AS kind,
      a.assessed_on,
      sub.name                AS subject_name,
      sc.score_hundredths,
      sc.did_not_sit,
      -- The mark's OWN snapshot, not the assessment's current total: what the
      -- paper was marked out of is what the percentage below means.
      sc.max_score_hundredths
    FROM assessment_scores sc
    JOIN allowed al ON al.id = sc.student_id
    JOIN assessments a ON a.id = sc.assessment_id
    JOIN subjects sub ON sub.id = a.subject_id
    WHERE a.is_active
      AND a.published_at IS NOT NULL
    ORDER BY a.assessed_on DESC, sub.name
    -- Fifty marks is more than a year of a centre's exams, and an uncapped list on
    -- an endpoint reachable from a phone is an invitation — the same cap the
    -- attendance range and the fee ledger already carry.
    LIMIT 50
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM allowed) THEN NULL ELSE jsonb_build_object(
    'marks', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', name,
        'kind', kind,
        'assessedOn', assessed_on,
        'subjectName', subject_name,
        'scoreHundredths', score_hundredths,
        'maxScoreHundredths', max_score_hundredths,
        'didNotSit', did_not_sit
      ) ORDER BY assessed_on DESC, subject_name), '[]'::jsonb)
      FROM marks
    )
  ) END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_portal_grades(uuid, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_grades(uuid, text, text) TO school_app;
