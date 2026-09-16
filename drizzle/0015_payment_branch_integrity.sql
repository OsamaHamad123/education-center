-- =============================================================================
-- A payment must belong to the same branch as the invoice it pays.
--
-- Found by the isolation test, not by reading: a branch admin could insert a
-- payment row carrying THEIR branch id against ANOTHER branch's invoice, and it was
-- accepted. The RLS policy checks the row's own `branch_id`, which was correct; the
-- foreign key checked that the invoice exists, which it did. Neither was asked
-- whether the two agreed — and foreign keys are not subject to RLS, so the invoice
-- the attacker could not SEE was still a valid target to point at.
--
-- What it would cost: the payment counts in the attacker's branch and is invisible
-- in the other one, so a family in branch B would show as unpaid while money sits
-- against their invoice in branch A. Not reachable through the application (every
-- write path reads the invoice through RLS first, and a foreign invoice is simply
-- not there) and the id is unguessable — but "unguessable" is not "prevented", and
-- this product's claim about isolation is that it is structural.
--
-- A composite foreign key is the fix, declared once and enforced by the database
-- whatever the query looks like. It works here precisely because an invoice's branch
-- never changes: the invoice records the branch that BILLED it, and a student who
-- transfers next term leaves this one where it is.
-- =============================================================================

ALTER TABLE invoices
  ADD CONSTRAINT invoices_id_branch_unique UNIQUE (id, branch_id);--> statement-breakpoint

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_invoice_id_invoices_id_fk;--> statement-breakpoint

ALTER TABLE payments
  ADD CONSTRAINT payments_invoice_branch_fk
  FOREIGN KEY (invoice_id, branch_id) REFERENCES invoices (id, branch_id) ON DELETE restrict;
