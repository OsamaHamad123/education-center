import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/shared/db/client";
import { portalSessions } from "@/shared/db/schema";
import { env } from "@/shared/config/env";
import { expiryFrom, PORTAL_SESSION } from "../domain/session";

/**
 * The portal's data access (docs/PARENT-PORTAL-PLAN.md, P1–P3).
 *
 * Everything here runs OUTSIDE `withTenant`, and that is the design rather than an
 * oversight: a parent has no tenant context — no role, no branch — so every RLS policy
 * would correctly refuse them. The three `app_portal_*` functions are SECURITY DEFINER
 * and do their own authorization, in the same way `app_public_lookup` has since Phase 9.
 *
 * Every one of them takes the parent's phone hash. A student id arriving from a URL is a
 * request, not a permission, and the check that the two belong together lives in the SQL
 * beside the data — not here, where it could be forgotten.
 */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The salt never leaves the server; it is passed to SQL so the hash is computed once. */
const salt = () => env.PORTAL_PHONE_SALT;

export type PortalChild = {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  branchName: string;
};

export type PortalAttendance = {
  fullName: string;
  studentCode: string;
  className: string;
  branchName: string;
  branchPhone: string | null;
  branchAddress: string | null;
  counts: { present: number; absent: number; late: number; excused: number };
  absences: { date: string; status: "absent" | "late"; subjectName: string; notes: string | null }[];
};

/**
 * The credential check: a student code and the last four digits, the same pair the
 * anonymous lookup takes. Returns the parent's phone HASH, or null — and null means the
 * same thing for a wrong code, wrong digits, an inactive student, or the feature being
 * switched off. Nothing in the reply says which.
 */
export async function verifyParent(studentCode: string, lastFour: string): Promise<string | null> {
  const rows = await db.execute<{ hash: string | null }>(
    sql`select app_portal_verify(${studentCode}, ${lastFour}, ${salt()}) as hash`,
  );
  return rows[0]?.hash ?? null;
}

export async function createSession(parentPhoneHash: string): Promise<string> {
  const token = randomBytes(PORTAL_SESSION.tokenBytes).toString("hex");
  await db.insert(portalSessions).values({
    tokenHash: sha256(token),
    parentPhoneHash,
    expiresAt: expiryFrom(new Date()),
  });

  await capSessionsFor(parentPhoneHash);
  // Opportunistic prune, as the lookup and the lockout both do: one fewer scheduled job
  // to notice has stopped running.
  await db.delete(portalSessions).where(lt(portalSessions.expiresAt, new Date()));
  return token;
}

/**
 * Keeps the newest few sessions for one phone and drops the rest
 * (docs/PORTAL-REVIEW-2026-09.md, finding 3).
 *
 * The credential is a code printed on a timetable, so it will be typed on more devices
 * than the family owns — a tutor's laptop, the office computer, a phone that was
 * later sold. Each of those was a thirty-day session that nobody could end. This is the
 * ceiling: sign in on a sixth device and the oldest one stops working, which is both the
 * eviction path the portal was missing and a bound on how much a leaked code is worth.
 */
async function capSessionsFor(parentPhoneHash: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM portal_sessions
    WHERE parent_phone_hash = ${parentPhoneHash}
      AND id NOT IN (
        SELECT id FROM portal_sessions
        WHERE parent_phone_hash = ${parentPhoneHash}
        ORDER BY created_at DESC
        LIMIT ${PORTAL_SESSION.maxPerParent}
      )`);
}

/** The parent behind a cookie, or null if it is unknown, expired or forged. */
export async function parentFor(token: string): Promise<string | null> {
  const [row] = await db
    .select({ hash: portalSessions.parentPhoneHash })
    .from(portalSessions)
    .where(and(eq(portalSessions.tokenHash, sha256(token)), gt(portalSessions.expiresAt, new Date())))
    .limit(1);

  return row?.hash ?? null;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(portalSessions).where(eq(portalSessions.tokenHash, sha256(token)));
}

/**
 * The audit row for a successful sign-in (docs/PORTAL-REVIEW-2026-09.md, finding 5).
 *
 * Through a SECURITY DEFINER function for the same reason the lookup's is: writing to
 * `audit_logs` requires a role and a parent has none. See `drizzle/0010`.
 */
export async function recordPortalAudit(input: { code: string; ipHash: string }): Promise<void> {
  await db.execute(sql`select app_record_portal_audit(${input.code}, ${input.ipHash})`);
}

/** Every active student behind one phone. Siblings included, by definition. */
export async function childrenOf(parentPhoneHash: string): Promise<PortalChild[]> {
  const rows = await db.execute<{ children: PortalChild[] }>(
    sql`select app_portal_children(${parentPhoneHash}, ${salt()}) as children`,
  );
  return rows[0]?.children ?? [];
}

/** One child's attendance, or null when the child is not this parent's. */
export async function attendanceFor(
  studentId: string,
  parentPhoneHash: string,
  from: string,
  to: string,
): Promise<PortalAttendance | null> {
  const rows = await db.execute<{ report: PortalAttendance | null }>(
    sql`select app_portal_attendance(${studentId}::uuid, ${parentPhoneHash}, ${salt()}, ${from}::date, ${to}::date) as report`,
  );
  return rows[0]?.report ?? null;
}

export type PortalBalance = {
  outstandingPiasters: number;
  months: { period: string; duePiasters: number; paidPiasters: number }[];
};

/**
 * What this child's family owes (P5d), or null when the pairing is refused.
 *
 * A separate function from `app_portal_attendance` because the two answer different
 * questions, and a centre that has not started billing should show attendance without
 * a money card claiming zero.
 */
export async function balanceFor(studentId: string, parentPhoneHash: string): Promise<PortalBalance | null> {
  const rows = await db.execute<{ balance: PortalBalance | null }>(
    sql`select app_portal_balance(${studentId}::uuid, ${parentPhoneHash}, ${salt()}) as balance`,
  );
  return rows[0]?.balance ?? null;
}

export type PortalMark = {
  name: string;
  kind: "quiz" | "monthly" | "final" | "other";
  assessedOn: string;
  subjectName: string;
  /** Null when the child did not sit it. */
  scoreHundredths: number | null;
  maxScoreHundredths: number;
  didNotSit: boolean;
};

export type PortalGrades = { marks: PortalMark[] };

/**
 * This child's PUBLISHED marks (`drizzle/0022`), or null when the pairing is refused.
 *
 * A third function rather than a wider `app_portal_attendance`, for the reason the
 * balance is a third one: the three answer different questions, and a centre that has
 * not entered a single mark should show attendance without a grades card claiming
 * anything at all.
 *
 * `published_at IS NOT NULL` is inside the SQL, not here. A half-marked paper cannot
 * reach a parent by any route this file could get wrong.
 */
export async function gradesFor(studentId: string, parentPhoneHash: string): Promise<PortalGrades | null> {
  const rows = await db.execute<{ grades: PortalGrades | null }>(
    sql`select app_portal_grades(${studentId}::uuid, ${parentPhoneHash}, ${salt()}) as grades`,
  );
  return rows[0]?.grades ?? null;
}

/** Whether this family has stopped messages (`drizzle/0018`). */
export async function messagingStopped(parentPhoneHash: string): Promise<boolean> {
  const rows = await db.execute<{ stopped: boolean }>(
    sql`select app_portal_messaging_stopped(${parentPhoneHash}) as stopped`,
  );
  return rows[0]?.stopped ?? false;
}

/**
 * The parent's own switch. Returns false when the database refused the pairing — the
 * same answer a tampered hash gets, and the same one a family whose branch is not in
 * the rollout gets.
 */
export async function setMessagingStopped(parentPhoneHash: string, stop: boolean): Promise<boolean> {
  const rows = await db.execute<{ ok: boolean }>(
    sql`select app_portal_set_messaging(${parentPhoneHash}, ${salt()}, ${stop}) as ok`,
  );
  return rows[0]?.ok ?? false;
}
