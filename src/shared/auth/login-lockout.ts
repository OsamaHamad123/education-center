"use server";

import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/shared/db/client";
import { loginAttempts } from "@/shared/db/schema";
import { LOGIN_LOCKOUT } from "@/shared/config/constants";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * Per-account sign-in lockout (docs/SECURITY-REVIEW.md, finding 1).
 *
 * Better Auth's rate limit counts REQUESTS per address, and that budget has to stay
 * generous because a branch office shares one address. This is the other half: a
 * counter keyed on the USERNAME, so an attacker spreading guesses across a thousand
 * addresses is throttled exactly as one machine would be.
 *
 * It runs outside `withTenant` on purpose — there is no tenant and no session yet;
 * these rows are written before anybody is authenticated. The table holds no
 * password, no hash and no address.
 */

function since(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

/**
 * Refuses when the account is locked. Called before the password is checked, so a
 * locked account costs an attacker a query and tells them nothing about the password.
 */
export async function assertNotLockedOut(username: string): Promise<Result<null>> {
  const name = username.trim().toLowerCase();
  if (!name) return ok(null);

  const [row] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(eq(loginAttempts.username, name), gt(loginAttempts.createdAt, since(LOGIN_LOCKOUT.windowMinutes))),
    );

  if ((row?.failures ?? 0) >= LOGIN_LOCKOUT.maxFailures) {
    return err("RATE_LIMITED", `${ar.auth.lockedOut} ${LOGIN_LOCKOUT.windowMinutes} ${ar.lookup.minutes}`);
  }
  return ok(null);
}

export async function recordFailedLogin(username: string): Promise<void> {
  const name = username.trim().toLowerCase();
  if (!name) return;

  await db.insert(loginAttempts).values({ username: name });
  // Opportunistic prune, like the lookup's: one fewer scheduled job to notice has
  // stopped running, and the index makes it cheap.
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, since(LOGIN_LOCKOUT.retentionMinutes)));
}

/**
 * Clears an account's failures once they get in. Somebody who mistypes twice and then
 * succeeds should start clean — a counter that only ever goes up locks out the
 * legitimate user long before it inconveniences the attacker.
 */
export async function clearFailedLogins(username: string): Promise<void> {
  const name = username.trim().toLowerCase();
  if (!name) return;

  await db.delete(loginAttempts).where(eq(loginAttempts.username, name));
}
