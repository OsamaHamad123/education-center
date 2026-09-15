import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { branches } from "./branches";
import { classes } from "./classes";
import { attendanceStatusEnum, sessionStatusEnum, trackEnum } from "./enums";
import { students } from "./students";
import { teachers } from "./teachers";
import { timetableSlots } from "./timetable";

/**
 * PROJECT_PLAN 7.13 — الحصة المنفذة. Created lazily, on the first attendance save.
 *
 * The snapshot columns (subject_name, times, track, rate) are the whole point of this
 * table: payroll reads them, so raising a teacher's rate tomorrow cannot change what
 * they earned yesterday (rule 10.6).
 */
export const classSessions = pgTable(
  "class_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    teacherId: uuid()
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    /** Null for an extra or make-up session that has no weekly slot. */
    timetableSlotId: uuid().references(() => timetableSlots.id, { onDelete: "set null" }),

    subjectName: text().notNull(),
    sessionDate: date().notNull(),
    periodNumber: smallint().notNull(),
    startTime: time().notNull(),
    endTime: time().notNull(),
    trackApplied: trackEnum().notNull(),
    rateAppliedPiasters: integer().notNull(),

    status: sessionStatusEnum().notNull().default("completed"),
    cancelReason: text(),
    isExtra: boolean().notNull().default(false),

    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("class_sessions_class_date_period_unique").on(t.classId, t.sessionDate, t.periodNumber),
    index("class_sessions_teacher_date_idx").on(t.teacherId, t.sessionDate),
    index("class_sessions_branch_date_idx").on(t.branchId, t.sessionDate),
    index("class_sessions_status_idx").on(t.status),
    check("class_sessions_rate_non_negative", sql`${t.rateAppliedPiasters} >= 0`),
    check("class_sessions_times_ordered", sql`${t.endTime} > ${t.startTime}`),
    check(
      "class_sessions_cancelled_has_reason",
      sql`(${t.status} = 'completed' and ${t.cancelReason} is null)
       or (${t.status} = 'cancelled' and ${t.cancelReason} is not null)`,
    ),
    check("class_sessions_extra_has_no_slot", sql`not ${t.isExtra} or ${t.timetableSlotId} is null`),
  ],
);

/** PROJECT_PLAN 7.14 — سجل الحضور. */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => classSessions.id, { onDelete: "restrict" }),
    /** Denormalized from the session so RLS and reporting never need a join. */
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    status: attendanceStatusEnum().notNull(),
    notes: text(),
    markedBy: text().references(() => user.id, { onDelete: "set null" }),
    markedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Saving attendance is an upsert on this key, which is what makes the mobile
    // screen safe to tap twice on a flaky connection.
    unique("attendance_records_session_student_unique").on(t.sessionId, t.studentId),
    index("attendance_records_student_idx").on(t.studentId),
    index("attendance_records_branch_status_idx").on(t.branchId, t.status),
    index("attendance_records_session_idx").on(t.sessionId),
  ],
);

export type ClassSession = typeof classSessions.$inferSelect;
export type NewClassSession = typeof classSessions.$inferInsert;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;
