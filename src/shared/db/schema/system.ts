import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { branches } from "./branches";
import { auditActionEnum } from "./enums";

/**
 * PROJECT_PLAN 7.15 — سجل التدقيق. Append-only: the app role is granted INSERT and
 * SELECT and nothing else, so a compromised app cannot erase its own trail.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid().references(() => branches.id, { onDelete: "restrict" }),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    action: auditActionEnum().notNull(),
    entity: text().notNull(),
    entityId: text(),
    before: jsonb(),
    after: jsonb(),
    /** Hashed, never raw — see lookupAttempts for the same reasoning. */
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_branch_created_idx").on(t.branchId, t.createdAt.desc()),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_user_idx").on(t.userId),
  ],
);

/**
 * PROJECT_PLAN 7.16 — rate limiting for the public lookup without adding Redis.
 * IPs are stored hashed with LOOKUP_IP_SALT; rows older than 7 days are deleted.
 */
export const lookupAttempts = pgTable(
  "lookup_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    ipHash: text().notNull(),
    studentCode: text(),
    success: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lookup_attempts_ip_created_idx").on(t.ipHash, t.createdAt.desc()),
    index("lookup_attempts_code_created_idx").on(t.studentCode, t.createdAt.desc()),
  ],
);

/** PROJECT_PLAN 7.17 — one row, enforced by the singleton check. */
/**
 * What a centre sends before anybody edits the wording (P4a).
 *
 * The same three strings are the column defaults in `drizzle/0012`, which is what gives
 * them to rows that already existed. They are restated here so a NEW row — the seed's,
 * and every integration fixture's — does not have to supply them.
 */
export const DEFAULT_TEMPLATES = {
  dailyAbsence: "السلام عليكم، {الطالب} غاب اليوم {اليوم} في: {الحصص}. برجاء المتابعة. {المركز} — {الفرع}",
  repeatedAbsence:
    "السلام عليكم، {الطالب} غاب اليوم {اليوم} في: {الحصص}، وهذا غيابه رقم {مرات} هذا الشهر. نرجو التواصل مع المكتب. {المركز} — {الفرع}",
  lowAttendance:
    "السلام عليكم، نسبة غياب {الطالب} بلغت {النسبة}% في الفترة الأخيرة. نرجو التواصل مع المكتب. {المركز} — {الفرع}",
} as const;

export const centerSettings = pgTable(
  "center_settings",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Always true; the unique index on it is what keeps this table to one row. */
    singleton: boolean().notNull().default(true).unique(),
    centerName: text().notNull(),
    logoPath: text(),
    primaryColor: text(),
    lookupEnabled: boolean().notNull().default(true),
    /**
     * The parent portal's master switch (P7). Separate from `lookupEnabled` because the
     * rollout needs to open the portal WITHOUT touching the lookup every family already
     * uses — and off by default, because a feature that arrives switched on has not been
     * rolled out, it has been released.
     */
    portalEnabled: boolean().notNull().default(false),
    teacherCanMarkAttendance: boolean().notNull().default(true),
    /** How many days back a branch admin may edit attendance. Super admin is unlimited. */
    attendanceEditWindowDays: integer().notNull().default(7),
    /** Absence percentage above which a student appears in the alerts report. */
    absenceAlertThresholdPercent: integer().notNull().default(25),
    /**
     * What the office sends parents (P4a). In the database, not the code, so changing
     * برجاء المتابعة to something firmer needs neither a developer nor a deploy.
     * Defaults live in `drizzle/0012` — the feature works the day it is switched on.
     */
    templateDailyAbsence: text().notNull().default(DEFAULT_TEMPLATES.dailyAbsence),
    templateRepeatedAbsence: text().notNull().default(DEFAULT_TEMPLATES.repeatedAbsence),
    templateLowAttendance: text().notNull().default(DEFAULT_TEMPLATES.lowAttendance),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("center_settings_singleton", sql`${t.singleton}`),
    check("center_settings_edit_window", sql`${t.attendanceEditWindowDays} between 0 and 365`),
    check("center_settings_absence_threshold", sql`${t.absenceAlertThresholdPercent} between 1 and 100`),
  ],
);

/**
 * Per-account sign-in failures (docs/SECURITY-REVIEW.md, finding 1).
 *
 * Keyed on the USERNAME, not the address: Better Auth's per-IP budget has to stay
 * generous because a branch office shares one address, which left a known username
 * brute-forceable from a botnet. Teacher access codes are six digits.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    username: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_username_created_idx").on(t.username, t.createdAt.desc())],
);

/**
 * A parent's portal session (docs/PARENT-PORTAL-PLAN.md, P1 and P6).
 *
 * RLS, despite there being no tenant — see `drizzle/0010`. The policy admits only
 * statements with NO `app.user_role`, which is the portal and nothing else: every staff
 * query runs inside `withTenant` and therefore carries a role, so none of them can read
 * a live session token hash even by accident. P1 reasoned by analogy with
 * `login_attempts` and got this wrong; a username somebody typed into a public form and
 * a live session token are not the same kind of secret.
 *
 * The phone and the token are both salted hashes, so the rows name nobody.
 */
export const portalSessions = pgTable(
  "portal_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** sha256 of the cookie's token. The token itself is never stored. */
    tokenHash: text().notNull().unique(),
    /** sha256 of the parent's normalized phone — the identity the session carries. */
    parentPhoneHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index("portal_sessions_token_idx").on(t.tokenHash),
    index("portal_sessions_expiry_idx").on(t.expiresAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type LookupAttempt = typeof lookupAttempts.$inferSelect;
export type CenterSettings = typeof centerSettings.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type PortalSession = typeof portalSessions.$inferSelect;
