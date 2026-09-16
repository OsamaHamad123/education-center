-- =============================================================================
-- Paying the teachers (docs/PRODUCT-REVIEW-2026-09.md, finding 2 — "the biggest
-- functional gap in the product that is not already written down as an open
-- question").
--
-- Payroll has always computed the month correctly and printed it beautifully. Then
-- the money was handed over and the system learned nothing: next month nobody could
-- answer "did we settle September?" from the product, only from the paper it printed.
--
-- This is the other half of the ledger P5 built, and it is deliberately the SAME
-- shape as `payments`, because it is the same kind of fact:
--
--  1. APPEND-ONLY, enforced by the GRANT. `school_app` gets SELECT and INSERT and
--     nothing else. A settlement recorded in error is undone by a REVERSAL row with
--     a negative amount pointing at what it reverses — never by an edit, and never
--     by a delete.
--
--  2. A SNAPSHOT, not a reference. `amount_piasters` and `sessions_count` are what
--     was computed and agreed at the moment of paying. They must not move afterwards
--     if a register is corrected, because the money has already changed hands — and
--     the difference between the snapshot and a later recomputation is exactly the
--     discrepancy somebody needs to see.
--
--  3. PER BRANCH, per teacher, per month. A teacher shared between two branches is
--     paid by each for its own lessons, which is how the payroll report already
--     groups them.
--
-- The consequence worth more than the record itself is the FREEZE: once a month is
-- settled for a teacher, that month's registers stop being editable for their
-- lessons. The application enforces it (`canEditSettledPeriod`), because the rule is
-- "not while the money is out the door" and a database constraint cannot say that in
-- Arabic to the person trying.
-- =============================================================================

CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE restrict,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE restrict,
  -- 'YYYY-MM'. Teachers are paid by the month, so the period is a month.
  period text NOT NULL,
  -- Negative on a reversal, exactly as in `payments`.
  amount_piasters integer NOT NULL,
  -- What the amount was computed from. Kept so a later recomputation can be COMPARED
  -- with what was paid rather than silently replacing it.
  sessions_count integer NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  paid_by text REFERENCES "user"(id) ON DELETE set null,
  note text,
  reverses_id uuid REFERENCES payroll_runs(id) ON DELETE restrict,
  CONSTRAINT payroll_runs_period_format CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT payroll_runs_sessions_non_negative CHECK (sessions_count >= 0),
  CONSTRAINT payroll_runs_direction CHECK (
    (reverses_id IS NULL AND amount_piasters > 0)
    OR (reverses_id IS NOT NULL AND amount_piasters < 0)
  ),
  -- One reversal per settlement: undoing the same payout twice would show the centre
  -- owing a month it has already paid.
  CONSTRAINT payroll_runs_one_reversal UNIQUE (reverses_id)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payroll_runs_branch_period_idx ON payroll_runs (branch_id, period);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payroll_runs_teacher_period_idx ON payroll_runs (teacher_id, period);--> statement-breakpoint

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- A teacher may READ their own settlements — that is the whole point of "شهر ٨: مدفوع"
-- on their own screen — and may write none.
CREATE POLICY payroll_runs_select ON payroll_runs FOR SELECT USING (
  app_can_read_branch(branch_id)
  OR (app_role() = 'teacher' AND teacher_id = app_teacher_id())
);--> statement-breakpoint

CREATE POLICY payroll_runs_insert ON payroll_runs FOR INSERT
  WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- No UPDATE and no DELETE policy, and no grant for either. Settlements are facts.
GRANT SELECT, INSERT ON payroll_runs TO school_app;
