import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { branches } from "./branches";
import { classes } from "./classes";
import { paymentMethodEnum } from "./enums";
import { students } from "./students";
import { user } from "./auth";

/**
 * The money the centre COLLECTS (P5). See `drizzle/0013` for the five decisions
 * behind the shape; the two that matter most while reading this file are:
 *
 *  - `payments` is APPEND-ONLY, enforced by the grant rather than by convention.
 *    A mistake is a reversal row with a negative amount, never an edit.
 *  - "paid" is not a column. It is `sum(payments) >= amount - discount`, computed
 *    in `domain/ledger.ts` when asked.
 */

export const feePlans = pgTable(
  "fee_plans",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    amountPiasters: integer().notNull(),
    /** A price rise is a NEW row with a later date, never an edit to this one. */
    effectiveFrom: date().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("fee_plans_class_from_idx").on(t.classId, t.effectiveFrom.desc()),
    unique("fee_plans_class_from_unique").on(t.classId, t.effectiveFrom),
    check("fee_plans_amount_non_negative", sql`${t.amountPiasters} >= 0`),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    studentId: uuid()
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    /** The class as it was WHEN BILLED — a later transfer must not restate this. */
    classId: uuid()
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    /** `YYYY-MM`. A month, because the fee is monthly and so is the question. */
    period: text().notNull(),
    amountPiasters: integer().notNull(),
    discountPiasters: integer().notNull().default(0),
    discountReason: text(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    // What the payments table's composite foreign key points at.
    unique("invoices_id_branch_unique").on(t.id, t.branchId),
    index("invoices_branch_period_idx").on(t.branchId, t.period),
    index("invoices_class_period_idx").on(t.classId, t.period),
    index("invoices_student_idx").on(t.studentId),
    // What makes generating a month idempotent: the office WILL run it twice.
    unique("invoices_student_period_unique").on(t.studentId, t.period),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    // No single-column reference: the foreign key is COMPOSITE, on
    // (invoice_id, branch_id), so a payment can never be attached to another branch's
    // invoice (drizzle/0015). Declared in the table extras below.
    invoiceId: uuid().notNull(),
    /** Negative on a reversal. The sign is the only difference between the two. */
    amountPiasters: integer().notNull(),
    method: paymentMethodEnum().notNull(),
    receiptYear: integer().notNull(),
    receiptNo: integer().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    receivedBy: text().references(() => user.id, { onDelete: "set null" }),
    note: text(),
    reversesId: uuid(),
  },
  (t) => [
    foreignKey({
      name: "payments_invoice_branch_fk",
      columns: [t.invoiceId, t.branchId],
      foreignColumns: [invoices.id, invoices.branchId],
    }).onDelete("restrict"),
    index("payments_invoice_idx").on(t.invoiceId),
    index("payments_branch_received_idx").on(t.branchId, t.receivedAt.desc()),
    unique("payments_receipt_unique").on(t.branchId, t.receiptYear, t.receiptNo),
    unique("payments_one_reversal").on(t.reversesId),
  ],
);

export const receiptCounters = pgTable(
  "receipt_counters",
  {
    branchId: uuid()
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    year: integer().notNull(),
    lastValue: integer().notNull().default(0),
  },
  (t) => [unique("receipt_counters_pk").on(t.branchId, t.year)],
);

export type FeePlan = typeof feePlans.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
