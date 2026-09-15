import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { branches } from "./branches";
import { classes } from "./classes";
import { enrollmentEndEnum, studentStatusEnum } from "./enums";

/** PROJECT_PLAN 7.5 — طالب. */
export const students = pgTable(
  "students",
  {
    id: uuid().primaryKey().defaultRandom(),

    /**
     * `{BRANCHCODE}-{YY}-{seq5}`, e.g. OBR-26-00042. Globally unique and NEVER
     * reissued — it survives a transfer to another branch (rule 10.3), which is
     * exactly why it is not derived from the current branch_id.
     */
    studentCode: text().notNull().unique(),

    fullName: text().notNull(),
    studentPhone: text(),
    studentWhatsapp: text(),
    parentPhone: text().notNull(),
    parentWhatsapp: text(),

    /**
     * Generated, not stored by the app: the public lookup matches on it, and a
     * column the app cannot get out of sync is one less way to lock a parent out.
     */
    parentPhoneLast4: text().generatedAlwaysAs(sql`right(parent_phone, 4)`),

    nationalId: text(),

    /** Current placement. History lives in student_enrollments. */
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),

    status: studentStatusEnum().notNull().default("active"),
    joinDate: date().notNull(),
    leftDate: date(),
    leaveReason: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("students_branch_status_idx").on(t.branchId, t.status),
    index("students_class_idx").on(t.classId),
    index("students_parent_phone_idx").on(t.parentPhone),
    index("students_parent_last4_idx").on(t.parentPhoneLast4),
    // Arabic name search in the students list is a trigram scan, not a LIKE prefix.
    index("students_full_name_trgm_idx").using("gin", sql`${t.fullName} gin_trgm_ops`),
    uniqueIndex("students_national_id_unique")
      .on(t.nationalId)
      .where(sql`national_id is not null`),
    // Archiving without a date and a reason would destroy the archive's usefulness.
    check(
      "students_archived_has_reason",
      sql`(${t.status} = 'active' and ${t.leftDate} is null and ${t.leaveReason} is null)
       or (${t.status} = 'archived' and ${t.leftDate} is not null and ${t.leaveReason} is not null)`,
    ),
  ],
);

/**
 * PROJECT_PLAN 7.6 — قيد الطالب: the enrollment history that IS the archive.
 * A row with end_date null is the student's current placement.
 */
export const studentEnrollments = pgTable(
  "student_enrollments",
  {
    id: uuid().primaryKey().defaultRandom(),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    startDate: date().notNull(),
    endDate: date(),
    endReason: enrollmentEndEnum(),
    note: text(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A student is in exactly one class at a time. Without this, a half-finished
    // transfer would leave them enrolled twice and counted twice in attendance.
    uniqueIndex("student_enrollments_one_open")
      .on(t.studentId)
      .where(sql`end_date is null`),
    index("student_enrollments_student_idx").on(t.studentId, t.startDate.desc()),
    index("student_enrollments_branch_idx").on(t.branchId),
    index("student_enrollments_class_idx").on(t.classId),
    check(
      "student_enrollments_closed_has_reason",
      sql`(${t.endDate} is null and ${t.endReason} is null)
       or (${t.endDate} is not null and ${t.endReason} is not null)`,
    ),
    check("student_enrollments_dates_ordered", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
  ],
);

/**
 * PROJECT_PLAN 7.5 — the per-branch, per-year counter behind student_code.
 * Incremented with SELECT … FOR UPDATE so two concurrent enrolments cannot collide.
 */
export const studentCodeCounters = pgTable(
  "student_code_counters",
  {
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    /** Two-digit academic year, e.g. 26. */
    year: integer().notNull(),
    lastValue: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.year] })],
);

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type StudentEnrollment = typeof studentEnrollments.$inferSelect;
export type NewStudentEnrollment = typeof studentEnrollments.$inferInsert;
