-- =============================================================================
-- الدرجات — assessments and the marks in them (asked for 2026-09-24).
--
-- The parent portal has existed since P2 and shows attendance, the timetable and
-- the fee ledger. The centre asked for grades in it, and grades did not exist
-- ANYWHERE in this product: no table, no screen, no column.
--
-- `docs/PARENT-PORTAL-PLAN.md` section 5 said so a year ago, and said what to do
-- about it: "Grades and exams. Not in the product, and a portal is not where to
-- add them." So this migration builds them where they belong — in the centre's own
-- product, entered by the people who mark the papers — and a SECOND migration
-- opens a capped, redacted window onto them for parents. Exactly the road the fee
-- ledger took: `drizzle/0013` built it, `drizzle/0014` showed it.
--
-- Four decisions, taken with the centre on 2026-09-24:
--
--  1. A LIST OF MARKS, NOT A COMPUTED AVERAGE. Each assessment carries what it was
--     out of, and each mark carries its own percentage. No weights, no term
--     average — because weighting is a POLICY that differs between centres, and a
--     wrong average is worse than no average. The schema leaves room for weights;
--     nothing computes one yet.
--
--  2. THE TEACHER ENTERS THEIR OWN, THE BRANCH CORRECTS ANY. The same shape as
--     attendance, and the same enforcement: RLS decides, not the application.
--
--  3. A PARENT SEES THEIR OWN CHILD'S MARK AND NOTHING ELSE. No class average and
--     no rank. Ranking children against each other inside a portal their families
--     read is a decision the centre declined, and this schema does not store one.
--
--  4. PUBLISHING IS A SEPARATE ACT. A mark is invisible to parents until somebody
--     publishes the assessment. Half an exam entered at four o'clock is not a
--     result, and a portal that shows it is a portal that generates phone calls.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE assessment_kind AS ENUM ('quiz', 'monthly', 'final', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- The assessment: one exam, for one class, in one subject.
--
-- Marks are stored in HUNDREDTHS of a mark, as integers, for the reason money is
-- stored in piasters: 17.5 out of 20 is an ordinary mark in this country, and a
-- float that is 17.499999 is a complaint from a parent. Nothing here is ever
-- displayed raw; `shared/lib/score.ts` is the only thing that formats it.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE restrict,
  class_id uuid NOT NULL REFERENCES classes (id) ON DELETE restrict,
  subject_id uuid NOT NULL REFERENCES subjects (id) ON DELETE restrict,
  -- Whose assessment it is. A teacher may read and write their own and no others,
  -- so this column is what their RLS policy turns on — the same role
  -- `class_sessions.teacher_id` plays for a register.
  teacher_id uuid NOT NULL REFERENCES teachers (id) ON DELETE restrict,

  name text NOT NULL,
  kind assessment_kind NOT NULL DEFAULT 'quiz',
  assessed_on date NOT NULL,
  max_score_hundredths integer NOT NULL,

  -- NULL until the office publishes it. This is the only thing standing between a
  -- half-marked paper and every parent in the branch.
  published_at timestamptz,
  -- Archived rather than deleted: this product does not erase records of children.
  is_active boolean NOT NULL DEFAULT true,

  created_by text REFERENCES "user" (id) ON DELETE set null,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assessments_max_score_positive
    CHECK (max_score_hundredths > 0 AND max_score_hundredths <= 100000),
  CONSTRAINT assessments_name_not_blank CHECK (btrim(name) <> '')
);--> statement-breakpoint

-- The pair a mark's composite foreign key points at, for the reason `drizzle/0015`
-- spells out: foreign keys are NOT subject to RLS, so an assessment in another
-- branch that a branch admin cannot see is still a valid target to name.
ALTER TABLE assessments
  DROP CONSTRAINT IF EXISTS assessments_id_branch_unique;--> statement-breakpoint

ALTER TABLE assessments
  ADD CONSTRAINT assessments_id_branch_unique UNIQUE (id, branch_id);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS assessments_class_date_idx
  ON assessments (class_id, assessed_on DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS assessments_branch_date_idx
  ON assessments (branch_id, assessed_on DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS assessments_teacher_idx
  ON assessments (teacher_id, assessed_on DESC);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- The marks.
--
-- Corrected in place with an audit entry, like `attendance_records` and unlike
-- `payments` — a mark is a judgement somebody can be wrong about, not money that
-- has changed hands, and the honest record of a correction is the audit log.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  -- Denormalised from the assessment so RLS and reporting never need a join, the
  -- same way `attendance_records.branch_id` is.
  branch_id uuid NOT NULL REFERENCES branches (id) ON DELETE restrict,
  student_id uuid NOT NULL REFERENCES students (id) ON DELETE restrict,

  -- NULL when the student did not sit it.
  score_hundredths integer,
  did_not_sit boolean NOT NULL DEFAULT false,

  -- SNAPSHOT of what this mark was out of, exactly as `class_sessions` snapshots
  -- the rate it was paid at. Raising an exam's total tomorrow must not silently
  -- re-score what a parent was shown yesterday — and it is what lets the database
  -- itself refuse 25 out of 20, which a cross-table CHECK could never do.
  max_score_hundredths integer NOT NULL,

  notes text,
  marked_by text REFERENCES "user" (id) ON DELETE set null,
  marked_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assessment_scores_assessment_student_unique UNIQUE (assessment_id, student_id),
  CONSTRAINT assessment_scores_max_positive CHECK (max_score_hundredths > 0),
  CONSTRAINT assessment_scores_in_range CHECK (
    score_hundredths IS NULL
    OR (score_hundredths >= 0 AND score_hundredths <= max_score_hundredths)
  ),
  -- A mark or an absence, never both and never neither.
  CONSTRAINT assessment_scores_absent_xor_score CHECK (
    (did_not_sit AND score_hundredths IS NULL)
    OR (NOT did_not_sit AND score_hundredths IS NOT NULL)
  )
);--> statement-breakpoint

ALTER TABLE assessment_scores
  DROP CONSTRAINT IF EXISTS assessment_scores_assessment_branch_fk;--> statement-breakpoint

ALTER TABLE assessment_scores
  ADD CONSTRAINT assessment_scores_assessment_branch_fk
  FOREIGN KEY (assessment_id, branch_id) REFERENCES assessments (id, branch_id) ON DELETE restrict;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS assessment_scores_student_idx ON assessment_scores (student_id);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS assessment_scores_assessment_idx ON assessment_scores (assessment_id);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Row level security.
--
-- The teacher arm is deliberately narrower than a branch admin's in WHICH rows it
-- admits, and wider than a register's in WHEN: a teacher may write their own
-- assessment's marks on any day, because a paper marked over the weekend is the
-- ordinary case and the "today only" rule that guards attendance would make the
-- feature unusable.
-- -----------------------------------------------------------------------------
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY assessments_select ON assessments FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
);--> statement-breakpoint

CREATE POLICY assessments_insert ON assessments FOR INSERT WITH CHECK (
  app_can_write_branch(branch_id)
  OR (app_role() = 'teacher'
      AND teacher_id = app_teacher_id()
      AND app_teacher_in_branch(branch_id)
      -- And only for a class they actually teach. Without this a teacher could
      -- create an assessment for any class in a branch they work in, and then hold
      -- the marks of children they have never met.
      AND EXISTS (
        SELECT 1 FROM timetable_slots ts
        WHERE ts.class_id = assessments.class_id
          AND ts.teacher_id = app_teacher_id()
          AND ts.is_active
      ))
);--> statement-breakpoint

CREATE POLICY assessments_update ON assessments FOR UPDATE
  USING (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
  )
  WITH CHECK (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
  );--> statement-breakpoint

ALTER TABLE assessment_scores ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE assessment_scores FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY assessment_scores_select ON assessment_scores FOR SELECT USING (
  app_can_read_branch(branch_id)
  -- A student's marks follow them to a new branch, the same way their attendance
  -- does (PROJECT_PLAN section 8), so a transfer does not blank their history.
  OR app_can_read_branch(app_student_current_branch(student_id))
  OR (app_role() = 'teacher' AND EXISTS (
        SELECT 1 FROM assessments a
        WHERE a.id = assessment_scores.assessment_id AND a.teacher_id = app_teacher_id()))
);--> statement-breakpoint

CREATE POLICY assessment_scores_insert ON assessment_scores FOR INSERT WITH CHECK (
  app_can_write_branch(branch_id)
  OR (app_role() = 'teacher' AND EXISTS (
        SELECT 1 FROM assessments a
        WHERE a.id = assessment_scores.assessment_id AND a.teacher_id = app_teacher_id()))
);--> statement-breakpoint

CREATE POLICY assessment_scores_update ON assessment_scores FOR UPDATE
  USING (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher' AND EXISTS (
          SELECT 1 FROM assessments a
          WHERE a.id = assessment_scores.assessment_id AND a.teacher_id = app_teacher_id()))
  )
  WITH CHECK (
    app_can_write_branch(branch_id)
    OR (app_role() = 'teacher' AND EXISTS (
          SELECT 1 FROM assessments a
          WHERE a.id = assessment_scores.assessment_id AND a.teacher_id = app_teacher_id()))
  );--> statement-breakpoint

-- No DELETE, and no grant for one. A mark that was wrong is corrected and audited;
-- a mark that is gone is a conversation nobody can reconstruct.
GRANT SELECT, INSERT, UPDATE ON assessments, assessment_scores TO school_app;
