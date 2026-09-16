"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { hashIp, requestMetadata } from "@/shared/actions/audit";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  limitBreach,
  normalizeLastFour,
  normalizeStudentCode,
  recordAttempt,
  retryAfterMinutes,
  validateCredentials,
} from "@/modules/lookup";
import { PORTAL_SESSION } from "../../domain/session";
import {
  createSession,
  destroySession,
  parentFor,
  recordPortalAudit,
  verifyParent,
} from "../../infrastructure/portal.repository";

/**
 * The same shape check the lookup does, for the same reason (P6, finding 4).
 *
 * A server action's argument is client-controlled, and this one was cast rather than
 * parsed — the only mutation in the product that skipped Zod, because it cannot use
 * `createAction` (that wrapper starts by requiring a STAFF session). A number in
 * `studentCode` crashed the normalizer with a TypeError and returned a 500 where the
 * lookup, one module over, returns a tidy Result.
 */
const credentialsSchema = z.object({
  studentCode: z.string().max(40),
  lastFour: z.string().max(10),
});

/** Set and cleared with the SAME path, or the browser keeps a second cookie (finding 1). */
const COOKIE_PATH = "/portal";

/**
 * Signing a parent in (docs/PARENT-PORTAL-PLAN.md, P1).
 *
 * The credential is the one they already have — a student code and the last four digits
 * of their phone — rather than a one-time code, because an OTP needs a messaging
 * provider that does not exist yet and a portal nobody can sign into is not a portal.
 * What this adds on top of the lookup is a SESSION: typed once a month, not once a visit.
 *
 * It reuses the lookup's rate limiter deliberately, on the same table and the same two
 * keys. Sign-in and lookup are the same guess against the same secret, so counting them
 * apart would hand an attacker twice the budget by alternating between two doors.
 */
export async function signInToPortal(raw: unknown): Promise<Result<{ children: number }>> {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", ar.lookup.notFound);

  const code = normalizeStudentCode(parsed.data.studentCode);
  const lastFour = normalizeLastFour(parsed.data.lastFour);

  // Shape first, so a malformed attempt never reaches the database or the limiter.
  const problem = validateCredentials({ code, lastFour });
  if (problem) return err("VALIDATION_ERROR", ar.lookup.notFound);

  const request = await requestMetadata();
  const ipHash = hashIp(request.ip ?? "unknown");

  const breach = await limitBreach({ ipHash, code });
  if (breach) {
    return err("RATE_LIMITED", `${ar.lookup.rateLimited} ${retryAfterMinutes(breach)} ${ar.lookup.minutes}`);
  }

  const parentHash = await verifyParent(code, lastFour);
  await recordAttempt({ ipHash, code, success: parentHash !== null });

  // One reply for a wrong code, wrong digits, a student who has left, and the feature
  // being switched off. The caller cannot tell which, and cannot time the difference.
  if (!parentHash) return err("NOT_FOUND", ar.lookup.notFound);

  const store = await cookies();
  // Signing in again ENDS the session this browser already had, rather than leaving it
  // alive and unreachable for thirty days (P6, finding 3).
  const previous = store.get(PORTAL_SESSION.cookie)?.value;
  if (previous) await destroySession(previous);

  const token = await createSession(parentHash);
  store.set(PORTAL_SESSION.cookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: PORTAL_SESSION.days * 24 * 60 * 60,
  });

  // Only successes are audited, as with the lookup: a wrong guess already costs a row in
  // `lookup_attempts`, and letting it cost a row here too would let anyone flood the log
  // an administrator reads.
  await recordPortalAudit({ code, ipHash });

  return ok({ children: 0 });
}

export async function signOutOfPortal(): Promise<Result<null>> {
  const store = await cookies();
  const token = store.get(PORTAL_SESSION.cookie)?.value;
  if (token) await destroySession(token);
  // WITH the path (P6, finding 1). `delete(name)` expires a cookie at the request's
  // default path, which is `/`, and a cookie is keyed on its path — so the one at
  // `/portal` survived untouched and "خروج" left the credential sitting in a shared
  // browser for thirty days. Only the server-side row delete was ending the session.
  store.delete({ name: PORTAL_SESSION.cookie, path: COOKIE_PATH });
  return ok(null);
}

/**
 * The signed-in parent, as a phone hash, or null.
 *
 * Not wrapped in React `cache`: it is called once per request by the layout and the
 * value is passed down, which is cheaper than caching and easier to reason about.
 */
export async function currentParent(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(PORTAL_SESSION.cookie)?.value;
  if (!token) return null;
  return parentFor(token);
}
