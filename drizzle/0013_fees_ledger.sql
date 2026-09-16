-- =============================================================================
-- The money the centre COLLECTS (docs/MESSAGING-AND-FEES-PLAN.md, phase P5).
--
-- Until now this product knew what a teacher had EARNED and nothing about what a
-- student had paid: twenty-three tables and not one of them held money coming in.
-- These four are the first ledger in the system, and the decisions behind them are
-- worth reading before the SQL.
--
--  1. A FEE BELONGS TO A CLASS, PER MONTH. That is how Egyptian centres price, and
--     it is the answer to question 1 of P5a. A student's invoice records the class
--     it was billed for, so moving them later does not rewrite what they owed.
--
--  2. PRICES ARE VERSIONED, NOT EDITED. `fee_plans` is append-only in practice —
--     a price rise is a new row with a later `effective_from`, exactly as
--     `teacher_rate_history` works. Editing the amount in place would silently
--     restate every month already billed at the old price.
--
--  3. PAYMENTS ARE APPEND-ONLY, AND THE DATABASE ENFORCES IT. `school_app` is
--     granted SELECT and INSERT on `payments` and NOTHING ELSE: no UPDATE, no
--     DELETE. A mistake is corrected by a REVERSAL row carrying a negative amount
--     and pointing at what it reverses. That is what a ledger is; anything else is
--     how money quietly disappears and nobody can say when.
--
--  4. "PAID" IS NOT A COLUMN. It is `sum(payments) >= amount - discount`, computed
--     when asked. A stored status is a second source of truth that drifts from the
--     first the day somebody inserts a row by hand.
--
--  5. THERE IS NO "CANCELLED" STATE. An invoice raised in error is discounted in
--     full, with a reason — which is the same outcome, auditable in the same place,
--     and one fewer state for the rest of the product to reason about.
-- =============================================================================

CREATE TYPE payment_method AS ENUM ('cash', 'instapay', 'wallet', 'bank');--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- What a class costs, from a given date.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE restrict,
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE restrict,
  amount_piasters integer NOT NULL,
  -- The first day of the month this price applies from. A price rise is a NEW row.
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "user"(id) ON DELETE set null,
  CONSTRAINT fee_plans_amount_non_negative CHECK (amount_piasters >= 0),
  CONSTRAINT fee_plans_class_from_unique UNIQUE (class_id, effective_from)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fee_plans_class_from_idx ON fee_plans (class_id, effective_from DESC);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- What one student owes for one month.
--
-- `UNIQUE (student_id, period)` is what makes generating a month IDEMPOTENT: the
-- office will run it twice, and the second run must bill nobody again.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE restrict,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE restrict,
  -- The class as it was WHEN BILLED. A transfer next term must not restate this one.
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE restrict,
  -- 'YYYY-MM'. A month, not a range: the fee is monthly and so is the question.
  period text NOT NULL,
  amount_piasters integer NOT NULL,
  discount_piasters integer NOT NULL DEFAULT 0,
  discount_reason text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_by text REFERENCES "user"(id) ON DELETE set null,
  CONSTRAINT invoices_student_period_unique UNIQUE (student_id, period),
  CONSTRAINT invoices_period_format CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT invoices_amount_non_negative CHECK (amount_piasters >= 0),
  -- A discount may reach the full amount (that is how an invoice raised in error is
  -- undone) but never exceed it, and never happen without a stated reason.
  CONSTRAINT invoices_discount_within_amount
    CHECK (discount_piasters >= 0 AND discount_piasters <= amount_piasters),
  CONSTRAINT invoices_discount_has_reason
    CHECK (discount_piasters = 0 OR (discount_reason IS NOT NULL AND length(btrim(discount_reason)) > 0))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS invoices_branch_period_idx ON invoices (branch_id, period);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_class_period_idx ON invoices (class_id, period);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_student_idx ON invoices (student_id);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Money actually received. Append-only; see decision 3 above.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE restrict,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE restrict,
  -- NEGATIVE on a reversal. The sign is the only difference between taking money
  -- and giving it back, which is why both live in one table.
  amount_piasters integer NOT NULL,
  method payment_method NOT NULL,
  -- Per branch, per year, unbroken — the office is asked for these by number.
  receipt_year integer NOT NULL,
  receipt_no integer NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by text REFERENCES "user"(id) ON DELETE set null,
  note text,
  reverses_id uuid REFERENCES payments(id) ON DELETE restrict,
  CONSTRAINT payments_receipt_unique UNIQUE (branch_id, receipt_year, receipt_no),
  -- A payment is positive and reverses nothing; a reversal is negative and names
  -- exactly what it undoes. Nothing else is a valid row.
  CONSTRAINT payments_direction CHECK (
    (reverses_id IS NULL AND amount_piasters > 0)
    OR (reverses_id IS NOT NULL AND amount_piasters < 0)
  ),
  -- One reversal per payment: reversing the same receipt twice would hand the money
  -- back twice on paper.
  CONSTRAINT payments_one_reversal UNIQUE (reverses_id)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments (invoice_id);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payments_branch_received_idx ON payments (branch_id, received_at DESC);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Receipt numbering, the same shape as `student_code_counters`: one row per branch
-- per year, locked FOR UPDATE while a number is taken, so two people at the desk
-- cannot be handed the same receipt number.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_counters (
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE restrict,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  CONSTRAINT receipt_counters_pk PRIMARY KEY (branch_id, year)
);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- RLS. Same shape as every other tenant table: read your branch, write only when
-- one specific branch is selected (so "كافة الفروع" cannot take money).
-- -----------------------------------------------------------------------------
ALTER TABLE fee_plans ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_plans FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE receipt_counters ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE receipt_counters FORCE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY fee_plans_select ON fee_plans FOR SELECT USING (app_can_read_branch(branch_id));--> statement-breakpoint
CREATE POLICY fee_plans_insert ON fee_plans FOR INSERT WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

CREATE POLICY invoices_select ON invoices FOR SELECT USING (app_can_read_branch(branch_id));--> statement-breakpoint
CREATE POLICY invoices_insert ON invoices FOR INSERT WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
-- Update, for a discount. Not for the amount: that is what the fee plan decides.
CREATE POLICY invoices_update ON invoices FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

CREATE POLICY payments_select ON payments FOR SELECT USING (app_can_read_branch(branch_id));--> statement-breakpoint
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
-- Deliberately NO update and NO delete policy. Even with the grant, there would be
-- nothing to permit them.

CREATE POLICY receipt_counters_select ON receipt_counters FOR SELECT USING (app_can_read_branch(branch_id));--> statement-breakpoint
CREATE POLICY receipt_counters_insert ON receipt_counters FOR INSERT WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint
CREATE POLICY receipt_counters_update ON receipt_counters FOR UPDATE
  USING (app_can_write_branch(branch_id)) WITH CHECK (app_can_write_branch(branch_id));--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- Grants. The important line is the one about `payments`.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT ON fee_plans TO school_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON invoices TO school_app;--> statement-breakpoint
-- SELECT and INSERT only. The application has no way to edit or delete a payment,
-- and that is not a convention anybody can forget — it is a privilege it was never
-- given.
GRANT SELECT, INSERT ON payments TO school_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON receipt_counters TO school_app;
