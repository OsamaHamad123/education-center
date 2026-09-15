import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** PROJECT_PLAN 7.1 — فرع. The tenant every other table hangs off. */
export const branches = pgTable(
  "branches",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    /** Short code used to build student codes, e.g. NSR / OBR / GIZ. Immutable once students exist (rule 10.1). */
    code: text().notNull().unique(),
    address: text(),
    phone: text(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("branches_is_active_idx").on(t.isActive),
    // The code is embedded in every student code, so a loose value would corrupt them.
    check("branches_code_format", sql`${t.code} ~ '^[A-Z]{2,5}$'`),
  ],
);

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;
