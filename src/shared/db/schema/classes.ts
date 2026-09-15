import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { branches } from "./branches";
import { genderEnum, trackEnum } from "./enums";

/** PROJECT_PLAN 7.3 — شعبة, e.g. "علمي 1". Tenant-owned: every row carries branch_id. */
export const classes = pgTable(
  "classes",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    name: text().notNull(),
    /** Drives which of the teacher's two rates a session snapshots (rule 10.6). */
    track: trackEnum().notNull(),
    gender: genderEnum().notNull(),
    gradeLevel: text().notNull(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("classes_branch_name_unique").on(t.branchId, t.name),
    index("classes_branch_active_idx").on(t.branchId, t.isActive),
  ],
);

/** PROJECT_PLAN 7.4 — a global subject list (فيزياء، كيمياء…), not per branch. */
export const subjects = pgTable(
  "subjects",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subjects_is_active_idx").on(t.isActive)],
);

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
