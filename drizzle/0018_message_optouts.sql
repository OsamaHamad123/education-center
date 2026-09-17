-- =============================================================================
-- "Stop messaging me" (docs/MESSAGING-AND-FEES-PLAN.md, P4c step 2).
--
-- P4c as a whole waits on §16 question 8 — which provider, what budget, and who
-- reads the replies. This is the one step of it that does not, and the one the
-- product needs TODAY rather than when a provider is chosen: since P4a and P4b the
-- office has been messaging parents, and a parent who says "stop" has had nowhere
-- to be recorded. The answer has been somebody's memory.
--
-- Three decisions:
--
--  1. KEYED ON A SALTED HASH OF THE PHONE, not the phone. A branch admin can
--     already see their own students' numbers; a table of every phone in the centre
--     would hand them the other branches' too. Hashed, a dump of this table names
--     nobody, and every join computes the hash in SQL the way the portal already
--     does.
--
--  2. A ROW MEANS "STOPPED". No row means messages are fine, so the common case
--     stores nothing and nothing has to be back-filled for the families who never
--     asked.
--
--  3. THE PARENT CAN SET IT THEMSELVES, from the portal, through a SECURITY DEFINER
--     function like every other portal query. That is the portal's actual role in
--     P4: the opt-out belongs where the parent already is, not in a reply to a
--     number nobody is watching.
--
-- It is honoured by the two screens that message anybody — the daily contact list
-- and the absence alerts — and it will be honoured before anything is queued if an
-- automatic sender is ever built.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parent_message_optouts (
  -- sha256 of PORTAL_PHONE_SALT || ':' || the normalized parent phone. The same
  -- identity `portal_sessions` uses, so one family is one row however many children
  -- they have and in however many branches.
  parent_phone_hash text PRIMARY KEY,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  -- 'parent' when they switched it off themselves, 'office' when somebody rang.
  source text NOT NULL DEFAULT 'office',
  note text,
  CONSTRAINT parent_message_optouts_source CHECK (source IN ('parent', 'office'))
);--> statement-breakpoint

ALTER TABLE parent_message_optouts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE parent_message_optouts FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Staff read it to know whether to offer the button. There is no branch on a phone —
-- a family may have children in two branches — so this is deliberately centre-wide,
-- and safe to be so precisely because decision 1 made the rows anonymous.
CREATE POLICY parent_message_optouts_select ON parent_message_optouts FOR SELECT
  USING (app_role() IS NOT NULL);--> statement-breakpoint

CREATE POLICY parent_message_optouts_write ON parent_message_optouts FOR INSERT
  WITH CHECK (app_role() IN ('super_admin', 'branch_admin'));--> statement-breakpoint

CREATE POLICY parent_message_optouts_delete ON parent_message_optouts FOR DELETE
  USING (app_role() IN ('super_admin', 'branch_admin'));--> statement-breakpoint

GRANT SELECT, INSERT, DELETE ON parent_message_optouts TO school_app;--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- The parent's own switch.
--
-- SECURITY DEFINER, like every other `app_portal_*` function: a parent has no role
-- and no tenant context, and giving a role-less caller direct write access to a table
-- is the mistake `drizzle/0010` exists to undo.
--
-- It re-verifies the parent the same way everything else in the portal does — the
-- hash must actually belong to an active student at a branch whose portal is open —
-- so a hash lifted from somewhere cannot be used to silence a family.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_portal_set_messaging(parent_hash text, phone_salt text, stop boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
DECLARE
  allowed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM students s
    JOIN branches b ON b.id = s.branch_id
    WHERE encode(digest(phone_salt || ':' || s.parent_phone, 'sha256'), 'hex') = parent_hash
      AND s.status = 'active'
      AND b.portal_enabled
      AND b.is_active
      AND EXISTS (SELECT 1 FROM center_settings cs WHERE cs.lookup_enabled AND cs.portal_enabled)
  ) INTO allowed;

  IF NOT allowed THEN
    RETURN false;
  END IF;

  IF stop THEN
    INSERT INTO parent_message_optouts (parent_phone_hash, source)
    VALUES (parent_hash, 'parent')
    ON CONFLICT (parent_phone_hash) DO NOTHING;
  ELSE
    DELETE FROM parent_message_optouts WHERE parent_phone_hash = parent_hash;
  END IF;

  RETURN true;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_portal_set_messaging(text, text, boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_set_messaging(text, text, boolean) TO school_app;--> statement-breakpoint

-- Whether this parent has stopped messages. Read by the portal to draw its own switch.
CREATE OR REPLACE FUNCTION app_portal_messaging_stopped(parent_hash text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT EXISTS (SELECT 1 FROM parent_message_optouts WHERE parent_phone_hash = parent_hash);
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_portal_messaging_stopped(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_portal_messaging_stopped(text) TO school_app;
