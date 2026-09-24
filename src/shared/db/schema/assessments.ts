import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { branches } from "./branches";
import { classes, subjects } from "./classes";
import { assessmentKindEnum } from "./enums";
import { students } from "./students";
import { teachers } from "./teachers";

/**
 * الدرجات (`drizzle/0021`). One exam, for one class, in one subject.
 *
 * Marks are integers in HUNDREDTHS of a mark, for the reason money is integer
 * piasters: 17.5 out of 20 is an ordinary mark and a float that is 17.499999 is a
 * phone call. `shared/lib/score.ts` is the only thing that reads or writes the unit.
 */
export const assessments = pgTable(
  "assessments",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    subjectId: uuid()
      .notNull()
      .references(() => subjects.id, { onDelete: "restrict" }),
    /** Whose assessment it is — the column a teacher's RLS policy turns on. */
    teacherId: uuid()
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),

    name: text().notNull(),
    kind: assessmentKindEnum().notNull().default("quiz"),
    assessedOn: date().notNull(),
    maxScoreHundredths: integer().notNull(),

    /** Null until the office publishes it. Parents see nothing before that. */
    publishedAt: timestamp({ withTimezone: true }),
    isActive: boolean().notNull().default(true),

    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assessments_class_date_idx").on(t.classId, t.assessedOn),
    index("assessments_branch_date_idx").on(t.branchId, t.assessedOn),
    index("assessments_teacher_idx").on(t.teacherId, t.assessedOn),
    check(
      "assessments_max_score_positive",
      sql`${t.maxScoreHundredths} > 0 and ${t.maxScoreHundredths} <= 100000`,
    ),
    check("assessments_name_not_blank", sql`btrim(${t.name}) <> ''`),
  ],
);

/**
 * One student's mark in one assessment.
 *
 * Corrected in place with an audit entry, like `attendance_records` and unlike
 * `payments`: a mark is a judgement somebody can be wrong about, not money that has
 * changed hands.
 *
 * The composite foreign key on (assessment_id, branch_id) and the unique key it
 * points at live in the SQL migration; Drizzle cannot express either.
 */
export const assessmentScores = pgTable(
  "assessment_scores",
  {
    id: uuid().primaryKey().defaultRandom(),
    assessmentId: uuid().notNull(),
    /** Denormalised from the assessment so RLS never needs a join. */
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),

    /** Null when the student did not sit it. */
    scoreHundredths: integer(),
    didNotSit: boolean().notNull().default(false),
    /**
     * A SNAPSHOT of what this mark was out of, exactly as `class_sessions` snapshots
     * the rate it was paid at. Raising an exam's total tomorrow must not re-score
     * what a parent was shown yesterday.
     */
    maxScoreHundredths: integer().notNull(),

    notes: text(),
    markedBy: text().references(() => user.id, { onDelete: "set null" }),
    markedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("assessment_scores_assessment_student_unique").on(t.assessmentId, t.studentId),
    index("assessment_scores_student_idx").on(t.studentId),
    index("assessment_scores_assessment_idx").on(t.assessmentId),
    check("assessment_scores_max_positive", sql`${t.maxScoreHundredths} > 0`),
    check(
      "assessment_scores_in_range",
      sql`${t.scoreHundredths} is null
       or (${t.scoreHundredths} >= 0 and ${t.scoreHundredths} <= ${t.maxScoreHundredths})`,
    ),
    check(
      "assessment_scores_absent_xor_score",
      sql`(${t.didNotSit} and ${t.scoreHundredths} is null)
       or (not ${t.didNotSit} and ${t.scoreHundredths} is not null)`,
    ),
  ],
);

export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type AssessmentScore = typeof assessmentScores.$inferSelect;
