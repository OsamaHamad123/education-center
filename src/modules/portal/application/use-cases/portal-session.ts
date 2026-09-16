"use server";

import { cookies } from "next/headers";
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
  verifyParent,
} from "../../infrastructure/portal.repository";

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
  const input = raw as { studentCode?: string; lastFour?: string };
  const code = normalizeStudentCode(input.studentCode ?? "");
  const lastFour = normalizeLastFour(input.lastFour ?? "");

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

  const token = await createSession(parentHash);
  const store = await cookies();
  store.set(PORTAL_SESSION.cookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal",
    maxAge: PORTAL_SESSION.days * 24 * 60 * 60,
  });

  return ok({ children: 0 });
}

export async function signOutOfPortal(): Promise<Result<null>> {
  const store = await cookies();
  const token = store.get(PORTAL_SESSION.cookie)?.value;
  if (token) await destroySession(token);
  store.delete(PORTAL_SESSION.cookie);
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
