import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { branches } from "./branches";
import { teachers } from "./teachers";
import { user } from "./auth";

/**
 * Paying the teachers — the other half of the ledger (`drizzle/0016`).
 *
 * Same shape as `payments`, because it is the same kind of fact: append-only, with a
 * reversal instead of an edit, and a SNAPSHOT of what was agreed rather than a live
 * recomputation. Money that has changed hands does not move when a register is
 * corrected afterwards; the difference between the two is the thing worth seeing.
 */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    teacherId: uuid()
      .notNull()
      .references(() => teachers.id, { onDelete: "restrict" }),
    /** `YYYY-MM`. Teachers are paid by the month. */
    period: text().notNull(),
    /** Negative on a reversal. */
    amountPiasters: integer().notNull(),
    /** What the amount was computed from, kept for comparison, not for recomputation. */
    sessionsCount: integer().notNull(),
    paidAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    paidBy: text().references(() => user.id, { onDelete: "set null" }),
    note: text(),
    reversesId: uuid(),
  },
  (t) => [
    index("payroll_runs_branch_period_idx").on(t.branchId, t.period),
    index("payroll_runs_teacher_period_idx").on(t.teacherId, t.period),
    unique("payroll_runs_one_reversal").on(t.reversesId),
    check("payroll_runs_sessions_non_negative", sql`${t.sessionsCount} >= 0`),
  ],
);

export type PayrollRun = typeof payrollRuns.$inferSelect;
