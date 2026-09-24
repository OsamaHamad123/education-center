-- =============================================================================
-- Three holes around who taught a lesson, and who gets paid for it.
--
-- All three were found by reading `manage-session.ts` next to `settle-payroll.ts`,
-- after the centre asked for "an algorithm for a teacher who covered someone else's
-- lesson, or took one in place of his own". The covering itself was already built
-- and already correct — the substitute is re-snapshotted at THEIR rate, on the
-- track the session was run at (rule 10.5). What was missing is everything around
-- the edges of it.
--
--  1. A SUBSTITUTION ERASED THE ORIGINAL TEACHER. `set_substitute` overwrites
--     `teacher_id` in place, so the moment Ahmad's lesson is handed to Khaled the
--     record says it was always Khaled's. Nobody can then answer "how many lessons
--     did Ahmad miss, and who covered them" — which is the question a centre asks
--     at the end of a month, and the reason it asked for this at all.
--
--  2. A SUBSTITUTION IGNORED THE SETTLED-MONTH FREEZE. Cancelling and restoring a
--     session both refuse once that teacher's month has been paid. Substituting did
--     not, and it moves money between TWO teachers: it takes a lesson off one
--     ledger and puts it on another. Do it after both have been paid and the centre
--     has overpaid one and underpaid the other, with nothing on either row saying
--     so. That guard belongs in the use case beside the other two — this migration
--     only gives it something to record.
--
--  3. A MAKE-UP LESSON COULD BE PAID TWICE. "He took a lesson in place of his own"
--     is recorded today as an extra session, which ADDS a lesson's pay. That is
--     right only if the original was cancelled. Nothing required it to be, and
--     nothing connected the two, so the ordinary case — teacher misses Sunday,
--     teaches it on Wednesday — pays for both.
--
-- The columns below are the record. The rules that write them live in the use case,
-- where a refusal can be an Arabic sentence instead of a constraint violation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Whose lesson it was before it was handed over.
--
-- The ORIGINAL owner, not the previous one: if a lesson passes from Ahmad to Khaled
-- to Mona, this still says Ahmad, because "whose lesson was this" has one answer and
-- it is not "Khaled". The use case coalesces rather than overwrites.
--
-- Nullable, and null is the common case — the overwhelming majority of lessons are
-- taught by the person on the timetable, and a column that had to be filled for all
-- of them would be a column that lies about all of them.
-- -----------------------------------------------------------------------------
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS substituted_from_teacher_id uuid
  REFERENCES teachers (id) ON DELETE restrict;--> statement-breakpoint

-- Payroll never reads it. The absence report does: "Ahmad, 4 lessons covered".
CREATE INDEX IF NOT EXISTS class_sessions_substituted_from_idx
  ON class_sessions (substituted_from_teacher_id, session_date)
  WHERE substituted_from_teacher_id IS NOT NULL;--> statement-breakpoint

-- A lesson cannot be handed to the person it was taken from. The use case already
-- refuses `teacher_id = input.teacherId`, but that check runs on the value the
-- client sent; this one runs on the row that was written.
ALTER TABLE class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_substitute_differs;--> statement-breakpoint

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_substitute_differs
  CHECK (substituted_from_teacher_id IS NULL OR substituted_from_teacher_id <> teacher_id);--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 2. The make-up lesson, and the lesson it makes up for.
--
-- A one-to-one link, enforced by a unique constraint rather than by the use case
-- checking first: two clerks recording a make-up for the same missed lesson is a
-- race, and a race is what a unique index is for. Without it the second one wins the
-- check, both rows are written, and the teacher is paid twice — which is the very
-- thing this exists to stop.
-- -----------------------------------------------------------------------------
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS makes_up_session_id uuid;--> statement-breakpoint

-- A composite key, for the reason `drizzle/0015` spells out at length: a plain
-- foreign key would let a branch admin point a make-up at a session in ANOTHER
-- branch, because foreign keys are not subject to RLS and the target they cannot see
-- is still a valid target to name. A session's branch never changes, so the pair is
-- stable enough to key on.
ALTER TABLE class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_id_branch_unique;--> statement-breakpoint

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_id_branch_unique UNIQUE (id, branch_id);--> statement-breakpoint

ALTER TABLE class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_makes_up_branch_fk;--> statement-breakpoint

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_makes_up_branch_fk
  FOREIGN KEY (makes_up_session_id, branch_id)
  REFERENCES class_sessions (id, branch_id) ON DELETE restrict;--> statement-breakpoint

-- One make-up per missed lesson. A partial index because null is the normal state
-- and a plain unique would allow only one of those.
DROP INDEX IF EXISTS class_sessions_makes_up_unique;--> statement-breakpoint

CREATE UNIQUE INDEX class_sessions_makes_up_unique
  ON class_sessions (makes_up_session_id)
  WHERE makes_up_session_id IS NOT NULL;--> statement-breakpoint

-- Only an extra session makes up for anything: a lesson that is on the timetable is
-- where it was always going to be. `is_extra` already requires a null slot, so this
-- keeps the three columns telling one story.
ALTER TABLE class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_makes_up_is_extra;--> statement-breakpoint

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_makes_up_is_extra
  CHECK (makes_up_session_id IS NULL OR is_extra);--> statement-breakpoint

-- And it cannot make up for itself, which the composite key alone would allow.
ALTER TABLE class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_makes_up_not_self;--> statement-breakpoint

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_makes_up_not_self
  CHECK (makes_up_session_id IS NULL OR makes_up_session_id <> id);
