-- =============================================================================
-- What a parent owes, in the portal (docs/MESSAGING-AND-FEES-PLAN.md, P5d).
--
-- The smallest part of P5 and the last: the office side is what the centre needed,
-- and a parent who can see a balance the office cannot explain is worse than a
-- parent who rings and asks. So this ships only now that `/fees` exists.
--
-- A new function rather than more columns on `app_portal_attendance`, because the
-- two answer different questions and a parent may reasonably be shown one without
-- the other. Same shape as the rest of the portal:
--
--   - SECURITY DEFINER, so a parent still needs no role and no tenant context;
--   - the STUDENT ID AND THE PARENT'S PHONE HASH must match in the same WHERE
--     clause, because an id from a URL is a request and not a permission;
--   - the same four switches gate it as every other portal query, so a branch that
--     is not in the rollout does not start quoting balances.
--
-- It returns only what a parent may see: the month, what is due after any discount,
-- what has been paid, and what is left. NOT the discount's REASON — "منحة حالة" is
-- the centre's note to itself, and a family reading it on a phone is a conversation
-- nobody planned for.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_portal_balance(
  target_student uuid,
  parent_hash text,
  phone_salt text
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  WITH allowed AS (
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
  months AS (
    SELECT
      i.period,
      (i.amount_piasters - i.discount_piasters) AS due_piasters,
      coalesce((SELECT sum(p.amount_piasters) FROM payments p WHERE p.invoice_id = i.id), 0)::int
        AS paid_piasters
    FROM invoices i
    JOIN allowed a ON a.id = i.student_id
    ORDER BY i.period DESC
    -- A year is every question a parent has about fees. An uncapped list on a public
    -- endpoint is an invitation, exactly as the attendance range is.
    LIMIT 12
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM allowed) THEN NULL ELSE jsonb_build_object(
    -- Summed per month and floored at zero: a month paid in advance must not cancel
    -- out an unpaid one and tell the family they owe nothing.
    'outstandingPiasters', (
      SELECT coalesce(sum(greatest(due_piasters - paid_piasters, 0)), 0)::int FROM months
    ),
    'months', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'period', period,
        'duePiasters', due_piasters,
        'paidPiasters', paid_piasters
      ) ORDER BY period DESC), '[]'::jsonb)
      FROM months
    )
  ) END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_portal_balance(uuid, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_balance(uuid, text, text) TO school_app;
