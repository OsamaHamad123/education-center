import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { LOGIN_LOCKOUT } from "@/shared/config/constants";
import type { Result } from "@/shared/lib/result";

/**
 * Runs the per-account lockout (login-lockout.ts) inside Better Auth's sign-in
 * endpoints instead of around them.
 *
 * It used to be driven by the login form: ask "is this account locked?", call
 * sign-in, then report the outcome. Those three calls were server actions, and a
 * server action is a public endpoint, so the lockout only held for people who used
 * the form:
 *  - posting straight to /api/auth/sign-in/username skipped the check;
 *  - anyone could clear any account's failure count;
 *  - anyone could lock somebody else out by reporting failures in their name.
 * As hooks, the check runs on every attempt however it arrives, and only the server
 * decides what counts as a failure.
 */

export type LockoutStore = {
  assertNotLockedOut(identifier: string): Promise<Result<null>>;
  recordFailedLogin(identifier: string): Promise<void>;
  clearFailedLogins(identifier: string): Promise<void>;
};

const SIGN_IN_FIELDS: Record<string, "username" | "email"> = {
  "/sign-in/username": "username",
  // Nobody signs in by email, but the endpoint exists because the username plugin
  // builds on it. Left unguarded it would be a way around the lockout.
  "/sign-in/email": "email",
};

/** The account a sign-in request names, normalised as the lockout stores it; null for any other request. */
export function signInIdentifier(path: string | undefined, body: unknown): string | null {
  const field = path ? SIGN_IN_FIELDS[path] : undefined;
  if (!field || typeof body !== "object" || body === null) return null;

  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== "string") return null;

  const identifier = value.trim().toLowerCase();
  return identifier || null;
}

/** Before the password is checked: a locked account costs an attacker a query and tells them nothing. */
export async function refuseIfLockedOut(
  store: LockoutStore,
  path: string | undefined,
  body: unknown,
): Promise<void> {
  const identifier = signInIdentifier(path, body);
  if (!identifier) return;

  const gate = await store.assertNotLockedOut(identifier);
  if (!gate.ok) {
    throw APIError.from("TOO_MANY_REQUESTS", { code: LOGIN_LOCKOUT.errorCode, message: gate.error.message });
  }
}

export type SignInOutcome = {
  /** Set by Better Auth when the attempt created a session. */
  newSession: unknown;
  /** What the endpoint returned; an APIError when the attempt was refused. */
  returned: unknown;
};

/** After the attempt: a success starts the account clean, a refusal counts against it. */
export async function recordSignInOutcome(
  store: LockoutStore,
  path: string | undefined,
  body: unknown,
  outcome: SignInOutcome,
): Promise<void> {
  const identifier = signInIdentifier(path, body);
  if (!identifier) return;

  if (outcome.newSession) {
    await store.clearFailedLogins(identifier);
    return;
  }
  if (isAPIError(outcome.returned)) {
    await store.recordFailedLogin(identifier);
  }
}

export function lockoutHooks(store: LockoutStore) {
  return {
    before: createAuthMiddleware(async (ctx) => {
      await refuseIfLockedOut(store, ctx.path, ctx.body);
    }),
    after: createAuthMiddleware(async (ctx) => {
      await recordSignInOutcome(store, ctx.path, ctx.body, {
        newSession: ctx.context.newSession,
        returned: ctx.context.returned,
      });
    }),
  };
}
