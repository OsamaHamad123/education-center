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
    teacherCanMarkAttendance: boolean().notNull().default(true),
    /** How many days back a branch admin may edit attendance. Super admin is unlimited. */
    attendanceEditWindowDays: integer().notNull().default(7),
    /** Absence percentage above which a student appears in the alerts report. */
    absenceAlertThresholdPercent: integer().notNull().default(25),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("center_settings_singleton", sql`${t.singleton}`),
    check("center_settings_edit_window", sql`${t.attendanceEditWindowDays} between 0 and 365`),
    check("center_settings_absence_threshold", sql`${t.absenceAlertThresholdPercent} between 1 and 100`),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type LookupAttempt = typeof lookupAttempts.$inferSelect;
export type CenterSettings = typeof centerSettings.$inferSelect;
