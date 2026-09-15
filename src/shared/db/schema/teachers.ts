import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { branches } from "./branches";
import { recordStatusEnum } from "./enums";

/**
 * PROJECT_PLAN 7.7 — معلم. A teacher is a GLOBAL profile: the same person may teach
 * in several branches, which is why this table has no branch_id.
 */
export const teachers = pgTable(
  "teachers",
  {
    id: uuid().primaryKey().defaultRandom(),
    fullName: text().notNull(),
    /** Normalized E.164. Doubles as the login username (section 9). */
    phone: text().notNull().unique(),
    specialization: text(),
    ratePiastersScientific: integer("rate_scientific_piasters").notNull(),
    ratePiastersLiterary: integer("rate_literary_piasters").notNull(),
    status: recordStatusEnum().notNull().default("active"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("teachers_status_idx").on(t.status),
    index("teachers_full_name_trgm_idx").using("gin", sql`${t.fullName} gin_trgm_ops`),
    check(
      "teachers_rates_non_negative",
      sql`${t.ratePiastersScientific} >= 0 and ${t.ratePiastersLiterary} >= 0`,
    ),
    check("teachers_phone_e164", sql`${t.phone} ~ '^\\+201[0125][0-9]{8}$'`),
  ],
);

/**
 * PROJECT_PLAN 7.8 — a trail of rate changes. Payroll never reads this: sessions
 * snapshot the rate at creation (rule 10.6), so history cannot be rewritten.
 * This table exists to answer "when did we raise this teacher?", nothing more.
 */
export const teacherRateHistory = pgTable(
  "teacher_rate_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    teacherId: uuid()
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    ratePiastersScientific: integer("rate_scientific_piasters").notNull(),
    ratePiastersLiterary: integer("rate_literary_piasters").notNull(),
    effectiveFrom: date().notNull(),
    changedBy: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("teacher_rate_history_teacher_idx").on(t.teacherId, t.effectiveFrom.desc())],
);

/** PROJECT_PLAN 7.9 — which branches a teacher is linked to. */
export const teacherBranches = pgTable(
  "teacher_branches",
  {
    teacherId: uuid()
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    isActive: boolean().notNull().default(true),
    linkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.teacherId, t.branchId] }),
    // RLS policies on several tables resolve "is this teacher mine?" through here,
    // so the branch-first lookup needs its own index.
    index("teacher_branches_branch_idx").on(t.branchId, t.isActive),
  ],
);

export type Teacher = typeof teachers.$inferSelect;
export type NewTeacher = typeof teachers.$inferInsert;
export type TeacherBranch = typeof teacherBranches.$inferSelect;
export type TeacherRateHistoryRow = typeof teacherRateHistory.$inferSelect;
