-- =============================================================================
-- Academic terms (§16 question 7; docs/ROADMAP.md, item 4).
--
-- The plan's own default was "date ranges only; add `academic_years` later", and
-- every report has worked on date ranges since. That default held for ten phases —
-- but the product already SAYS "الفصل" in one place and does not mean it: the public
-- lookup shows a parent a "term" figure that is really the last twelve months,
-- because there was nothing better to ask. `TERM_MONTHS = 12` carried a comment
-- naming this question.
--
-- So this is the smallest thing that makes the word true, and three decisions keep
-- it small:
--
--  1. A TERM IS A NAMED DATE RANGE, and nothing else. Reports keep working on from
--     and to; a term fills them in. Nothing that already computes anything is
--     rewritten, and a centre that never adds a term sees exactly what it sees now.
--
--  2. CENTRE-WIDE, not per branch. The academic calendar comes from the ministry and
--     the branches share it. A branch_id here would be three copies of one fact to
--     keep in step, and the first time they disagreed nobody would know which was
--     right.
--
--  3. FEES STAY MONTHLY. P5 answered that question and built it; a term fee is a
--     different feature, not a consequence of naming the calendar.
--
-- Readable by everyone, including an anonymous lookup, exactly as `center_settings`
-- is: term dates are on a poster in the entrance. Writable by a super admin only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- "الفصل الدراسي الأول 2026/2027". Free text: a centre names its own calendar, and
  -- an enum of term names would be wrong in the first year somebody adds a summer.
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "user"(id) ON DELETE set null,
  CONSTRAINT academic_terms_name_unique UNIQUE (name),
  CONSTRAINT academic_terms_dates CHECK (end_date >= start_date)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS academic_terms_start_idx ON academic_terms (start_date DESC);--> statement-breakpoint

-- Terms must not overlap: "the current term" has to have exactly one answer, and a
-- calendar that can give two is a calendar that will.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE academic_terms
  ADD CONSTRAINT academic_terms_no_overlap
  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&);--> statement-breakpoint

ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE academic_terms FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- `USING (true)`, like `center_settings`: the public lookup reads this with no role at
-- all, and a term's dates are on a poster in the entrance.
CREATE POLICY academic_terms_select ON academic_terms FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY academic_terms_insert ON academic_terms FOR INSERT
  WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY academic_terms_update ON academic_terms FOR UPDATE
  USING (app_role() = 'super_admin') WITH CHECK (app_role() = 'super_admin');--> statement-breakpoint
CREATE POLICY academic_terms_delete ON academic_terms FOR DELETE
  USING (app_role() = 'super_admin');--> statement-breakpoint

-- DELETE is granted, unusually for this codebase: a term is a label on a calendar, not
-- a record of something that happened. Removing one mistyped in September changes no
-- attendance, no invoice and no payslip — every one of those is stored against DATES.
GRANT SELECT, INSERT, UPDATE, DELETE ON academic_terms TO school_app;
