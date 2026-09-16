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

  // Opportunistic prune, as the lookup and the lockout both do: one fewer scheduled job
  // to notice has stopped running.
  await db.delete(portalSessions).where(lt(portalSessions.expiresAt, new Date()));
  return token;
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

export async function touchSession(token: string): Promise<void> {
  await db
    .update(portalSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(portalSessions.tokenHash, sha256(token)));
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(portalSessions).where(eq(portalSessions.tokenHash, sha256(token)));
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
