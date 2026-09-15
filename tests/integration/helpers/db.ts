import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/shared/db/schema";
import type { TenantContext } from "@/shared/auth/tenant-context";

/**
 * Two connections, and the difference between them is the entire point of this suite:
 *
 *  - `ownerDb` connects as `school_owner` (BYPASSRLS). It applies migrations and
 *    creates fixtures across several branches — something no real request can do.
 *  - `appDb` connects as `school_app` (NOBYPASSRLS), exactly as the running
 *    application does. Every assertion about what a role can see runs through it.
 *
 * A test that queried the owner connection would prove nothing at all.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — see tests/integration/helpers/setup.ts`);
  return value;
}

const ownerClient = postgres(requireEnv("DATABASE_TEST_OWNER_URL"), { max: 1, onnotice: () => {} });
const appClient = postgres(requireEnv("DATABASE_TEST_URL"), { max: 5, onnotice: () => {} });

export const ownerDb = drizzle(ownerClient, { schema, casing: "snake_case" });
export const appDb = drizzle(appClient, { schema, casing: "snake_case" });

export async function applyMigrations(): Promise<void> {
  await migrate(ownerDb, { migrationsFolder: "./drizzle" });
}

/** Empties every table. Runs as owner because RLS would otherwise hide most rows. */
export async function resetDatabase(): Promise<void> {
  await ownerDb.execute(sql`truncate table
    attendance_records, class_sessions, timetable_slots, branch_breaks,
    branch_schedule_settings, student_enrollments, student_code_counters, students,
    teacher_branches, teacher_rate_history, teachers, classes, subjects,
    audit_logs, lookup_attempts, account, session, verification, "user",
    branches, center_settings
    restart identity cascade`);
}

export async function closeConnections(): Promise<void> {
  await Promise.all([ownerClient.end(), appClient.end()]);
}

/**
 * Runs `fn` on the APP connection with the given tenant context — the same
 * `set_config(..., true)` dance `withTenant` performs in production.
 */
export async function asTenant<T>(
  ctx: TenantContext,
  fn: (tx: Parameters<Parameters<typeof appDb.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.user_role', ${ctx.role}, true),
      set_config('app.branch_id', ${ctx.branchId ?? ""}, true),
      set_config('app.teacher_id', ${ctx.teacherId ?? ""}, true)`);
    return fn(tx);
  });
}

export const ctxFor = {
  superAdmin: (branchId: string | null = null): TenantContext => ({
    userId: "usr_super",
    role: "super_admin",
    branchId,
    teacherId: null,
  }),
  branchAdmin: (branchId: string, userId = "usr_branch_admin"): TenantContext => ({
    userId,
    role: "branch_admin",
    branchId,
    teacherId: null,
  }),
  teacher: (teacherId: string, userId = "usr_teacher"): TenantContext => ({
    userId,
    role: "teacher",
    branchId: null,
    teacherId,
  }),
};
