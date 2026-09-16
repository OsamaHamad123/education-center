-- =============================================================================
-- Message templates, and a record that somebody was contacted
-- (docs/MESSAGING-AND-FEES-PLAN.md, phases P4a and P4b).
--
-- Today the absence alerts open WhatsApp with NOTHING in it. Every message is
-- typed by hand, every one is worded differently, and nothing anywhere records
-- that a parent was contacted at all. Two changes fix both halves, and neither
-- needs a messaging provider — which is the whole point of splitting P4.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The wording lives in the database, not in the code.
--
-- A centre that wants to change "برجاء المتابعة" to something firmer should not
-- need a developer and a deploy. The defaults below are what an office would
-- actually send, so the feature works the moment it is switched on rather than
-- after somebody sits down to write three messages.
--
-- Placeholders are Arabic words in braces because the person editing them reads
-- Arabic: {الطالب} {اليوم} {الحصص} {النسبة} {مرات} {الفرع} {المركز}. An unknown
-- one is left in the text untouched rather than silently dropped, and the
-- settings screen previews the result, so a typo is visible before it is sent to
-- five hundred families.
-- -----------------------------------------------------------------------------
ALTER TABLE center_settings
  ADD COLUMN IF NOT EXISTS template_daily_absence text NOT NULL
  DEFAULT 'السلام عليكم، {الطالب} غاب اليوم {اليوم} في: {الحصص}. برجاء المتابعة. {المركز} — {الفرع}';--> statement-breakpoint

ALTER TABLE center_settings
  ADD COLUMN IF NOT EXISTS template_repeated_absence text NOT NULL
  DEFAULT 'السلام عليكم، {الطالب} غاب اليوم {اليوم} في: {الحصص}، وهذا غيابه رقم {مرات} هذا الشهر. نرجو التواصل مع المكتب. {المركز} — {الفرع}';--> statement-breakpoint

ALTER TABLE center_settings
  ADD COLUMN IF NOT EXISTS template_low_attendance text NOT NULL
  DEFAULT 'السلام عليكم، نسبة غياب {الطالب} بلغت {النسبة}% في الفترة الأخيرة. نرجو التواصل مع المكتب. {المركز} — {الفرع}';--> statement-breakpoint

-- -----------------------------------------------------------------------------
-- 'contact' as an audit action.
--
-- Opening a WhatsApp conversation about a child is not a 'create', an 'update' or
-- a 'login', and recording it as one would make the log lie about what happened.
-- The value is added rather than the column widened to free text, so the log stays
-- something you can filter.
--
-- What it buys is the half of P4a that is worth more than the templates: the office
-- can see this child's parent was contacted yesterday and not ring them twice, and
-- the owner can see whether anybody is doing it at all.
-- -----------------------------------------------------------------------------
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'contact';
