import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { branches } from "./branches";
import { classes, subjects } from "./classes";
import { trackEnum } from "./enums";
import { teachers } from "./teachers";

/** PROJECT_PLAN 7.10 — the bell schedule, per branch and track. */
export const branchScheduleSettings = pgTable(
  "branch_schedule_settings",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    track: trackEnum().notNull(),
    dayStartTime: time().notNull(),
    periodDurationMin: integer().notNull(),
    periodsCount: integer().notNull(),
    /** ISO weekdays. Default {6,7,1,2,3,4} = Saturday → Thursday. */
    workingDays: smallint().array().notNull().default([6, 7, 1, 2, 3, 4]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("branch_schedule_settings_branch_track_unique").on(t.branchId, t.track),
    check("branch_schedule_period_duration", sql`${t.periodDurationMin} between 20 and 180`),
    check("branch_schedule_periods_count", sql`${t.periodsCount} between 1 and 12`),
    check(
      "branch_schedule_working_days_iso",
      sql`array_length(${t.workingDays}, 1) between 1 and 7
       and ${t.workingDays} <@ array[1,2,3,4,5,6,7]::smallint[]`,
    ),
  ],
);

/** PROJECT_PLAN 7.11 — breaks inserted after a given period. */
export const branchBreaks = pgTable(
  "branch_breaks",
  {
    id: uuid().primaryKey().defaultRandom(),
    settingsId: uuid()
      .notNull()
      .references(() => branchScheduleSettings.id, { onDelete: "cascade" }),
    afterPeriod: smallint().notNull(),
    durationMin: integer().notNull(),
    label: text(),
  },
  (t) => [
    // Not in section 7.11, but two breaks after the same period would make
    // compute-periods ambiguous. Added deliberately — see docs/PROGRESS.md.
    unique("branch_breaks_settings_after_period_unique").on(t.settingsId, t.afterPeriod),
    check("branch_breaks_after_period", sql`${t.afterPeriod} between 1 and 12`),
    check("branch_breaks_duration", sql`${t.durationMin} between 1 and 240`),
  ],
);

/**
 * PROJECT_PLAN 7.12 — the weekly plan. Times are computed from the bell schedule
 * and stored here so conflict checks and reads are a single index scan.
 *
 * The teacher-overlap exclusion constraint cannot be expressed in Drizzle; it lives
 * in the custom SQL migration alongside the RLS policies.
 */
export const timetableSlots = pgTable(
  "timetable_slots",
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
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    /** ISO weekday, 1 = Monday … 7 = Sunday. */
    dayOfWeek: smallint().notNull(),
    periodNumber: smallint().notNull(),
    startTime: time().notNull(),
    endTime: time().notNull(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("timetable_slots_class_day_period_unique")
      .on(t.classId, t.dayOfWeek, t.periodNumber)
      .where(sql`is_active`),
    index("timetable_slots_teacher_day_idx").on(t.teacherId, t.dayOfWeek),
    index("timetable_slots_branch_idx").on(t.branchId, t.isActive),
    check("timetable_slots_day_of_week", sql`${t.dayOfWeek} between 1 and 7`),
    check("timetable_slots_period_number", sql`${t.periodNumber} >= 1`),
    check("timetable_slots_times_ordered", sql`${t.endTime} > ${t.startTime}`),
  ],
);

export type BranchScheduleSettings = typeof branchScheduleSettings.$inferSelect;
export type BranchBreak = typeof branchBreaks.$inferSelect;
export type TimetableSlot = typeof timetableSlots.$inferSelect;
export type NewTimetableSlot = typeof timetableSlots.$inferInsert;
