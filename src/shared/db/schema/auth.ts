import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { branches } from "./branches";
import { userRoleEnum } from "./enums";
import { teachers } from "./teachers";

/**
 * PROJECT_PLAN 7.2 — Better Auth tables (Drizzle adapter + username plugin), with the
 * extra fields this system needs on `user`.
 *
 * Better Auth uses text ids, not uuids, so every FK pointing at a user is text.
 */

export const user = pgTable(
  "user",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),

    /** username plugin. Admins pick one; teachers get their normalized phone. */
    username: text().unique(),
    displayUsername: text(),

    role: userRoleEnum().notNull(),
    /** Set for branch_admin only — the single source of their tenant scope. */
    branchId: uuid().references(() => branches.id, { onDelete: "restrict" }),
    /** Set for teacher only. */
    teacherId: uuid().references(() => teachers.id, { onDelete: "restrict" }),

    /** Inactive users cannot log in, but their audit trail and sessions stay. */
    isActive: boolean().notNull().default(true),
    /** Admins created with a temporary password must change it on first login. */
    mustChangePassword: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_role_idx").on(t.role),
    index("user_branch_idx").on(t.branchId),
    index("user_teacher_idx").on(t.teacherId),
    /**
     * The role decides which scope column is set — enforced here rather than only in
     * the application, because `resolveTenantContext` trusts these columns absolutely.
     */
    check(
      "user_role_scope",
      sql`(${t.role} = 'branch_admin' and ${t.branchId} is not null and ${t.teacherId} is null)
       or (${t.role} = 'super_admin'  and ${t.branchId} is null     and ${t.teacherId} is null)
       or (${t.role} = 'teacher'      and ${t.branchId} is null     and ${t.teacherId} is not null)`,
    ),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId), index("session_expires_idx").on(t.expiresAt)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
