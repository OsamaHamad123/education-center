import { lt, sql } from "drizzle-orm";
import { db } from "@/shared/db/client";
import { lookupAttempts } from "@/shared/db/schema";
import { LOOKUP_LIMITS } from "../domain/rate-limit";

/**
 * The public lookup's data access.
 *
 * Unlike every other repository in the system this one does NOT take a
 * `TenantContext`, because there is no session and no tenant: the caller is a parent
 * with a code and four digits. Everything therefore goes through the two
 * SECURITY DEFINER functions from `drizzle/0006`, which do their own authorization
 * and return an already-redacted document. No table is read directly.
 */

export type LookupDocument = {
  firstName: string;
  familyInitial: string;
  branchName: string;
  className: string;
  timetable: {
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
    subjectName: string;
  }[];
  termCounts: { present: number; absent: number; late: number; excused: number };
  monthCounts: { present: number; absent: number; late: number; excused: number };
  absences: { date: string; status: "absent" | "late"; notes: string | null; subjectName: string }[];
};

/**
 * Null for every reason a lookup can fail: no such code, wrong digits, an archived
 * student, or the feature turned off. One return value for all of them is the point
 * — the caller cannot tell which, so nothing can be enumerated.
 */
export async function runPublicLookup(input: {
  code: string;
  lastFour: string;
  from: string;
  to: string;
}): Promise<LookupDocument | null> {
  const rows = await db.execute(
    sql`select app_public_lookup(${input.code}, ${input.lastFour}, ${input.from}::date, ${input.to}::date) as doc`,
  );

  const doc = (rows[0] as { doc: LookupDocument | null } | undefined)?.doc;
  return doc ?? null;
}

export async function countRecentFailures(input: {
  ipHash: string;
  code: string;
}): Promise<{ byIp: number; byCode: number }> {
  const rows = await db.execute(
    sql`select * from app_lookup_failures(
          ${input.ipHash},
          ${input.code},
          ${`${LOOKUP_LIMITS.ipWindowMinutes} minutes`}::interval,
          ${`${LOOKUP_LIMITS.codeWindowMinutes} minutes`}::interval)`,
  );

  const row = rows[0] as { by_ip: number; by_code: number } | undefined;
  return { byIp: row?.by_ip ?? 0, byCode: row?.by_code ?? 0 };
}

/**
 * Records the attempt. The IP is already hashed by the caller — a raw address is
 * personal data and CLAUDE.md keeps it out of the database entirely.
 */
export async function recordAttempt(input: {
  ipHash: string;
  code: string | null;
  success: boolean;
}): Promise<void> {
  await db.insert(lookupAttempts).values({
    ipHash: input.ipHash,
    studentCode: input.code,
    success: input.success,
  });
}

/**
 * Writes the audit row for a SUCCESSFUL lookup (rule 10.8; SECURITY-REVIEW finding 4).
 *
 * Through a SECURITY DEFINER function because `audit_logs_insert` requires a role and
 * a parent has none — see drizzle/0008 for how narrow the hole is. Failures are not
 * audited: they live in `lookup_attempts`, and writing every wrong guess here would
 * let anyone flood the record an administrator reads.
 */
export async function recordLookupAudit(input: { code: string; ipHash: string }): Promise<void> {
  await db.execute(sql`select app_record_lookup_audit(${input.code}, ${input.ipHash})`);
}

/** PROJECT_PLAN 7.16: nothing older than a week is kept. */
const RETENTION_DAYS = 7;

/**
 * Pruned opportunistically rather than by a cron: the table is small, the index on
 * `created_at` makes the delete cheap, and one fewer scheduled job is one fewer
 * thing to notice has stopped running.
 */
export async function pruneOldAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await db.delete(lookupAttempts).where(lt(lookupAttempts.createdAt, cutoff));
}
