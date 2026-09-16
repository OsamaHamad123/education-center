"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "./auth";
import { getSessionUser, resolveTenantContext } from "./session";
import { requestMetadata, writeAuditLog } from "@/shared/actions/audit";
import { PASSWORD_POLICY } from "@/shared/config/constants";
import { db } from "@/shared/db/client";
import { user } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * Changing your own password (docs/AUDIT-2026-09.md, findings 3 and 4).
 *
 * This used to be two calls the browser made in sequence: Better Auth's
 * `changePassword`, then a separate action that cleared `must_change_password`. That
 * second action took no arguments and verified nothing, so it could be called on its
 * own — clearing the flag while the temporary password, read out over a phone call
 * and probably written on paper, stayed valid. The record then said the change had
 * happened.
 *
 * They are one action now, in one order, on the server: the flag is cleared only
 * after Better Auth has accepted the new password, and there is no longer anything to
 * call that would clear it by itself.
 *
 * The length floor lives here too, for the same reason. It was a check in the client
 * component; underneath, Better Auth's `minPasswordLength` is 6 — lowered for the
 * teacher access codes that need it, and inherited by admins who should not have it.
 *
 * Not a `createAction`: it needs no permission (everyone may change their own
 * password), it must work for a super admin in "كافة الفروع" mode, and it touches
 * only the caller's own row.
 */

const schema = z
  .object({
    current: z.string().min(1),
    next: z.string().min(1).max(128),
    confirm: z.string().min(1),
  })
  .refine((value) => value.next === value.confirm, {
    path: ["confirm"],
    message: ar.auth.passwordsDoNotMatch,
  });

export async function changeOwnPassword(raw: unknown): Promise<Result<{ userId: string }>> {
  const sessionUser = await getSessionUser();
  const ctx = await resolveTenantContext();
  if (!sessionUser || !ctx) return err("UNAUTHORIZED", ar.errors.UNAUTHORIZED);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? ar.errors.VALIDATION_ERROR;
    return err("VALIDATION_ERROR", message);
  }

  // A teacher's credential IS a six-digit access code (section 9), so the floor is
  // theirs; an admin password is typed once and lives for months.
  const minLength =
    sessionUser.role === "teacher" ? PASSWORD_POLICY.teacherMinLength : PASSWORD_POLICY.adminMinLength;
  if (parsed.data.next.length < minLength) {
    return err("VALIDATION_ERROR", `${ar.auth.passwordTooShort} ${minLength}`);
  }

  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: {
        currentPassword: parsed.data.current,
        newPassword: parsed.data.next,
        // A password change signs out every other device (PROJECT_PLAN section 9).
        revokeOtherSessions: true,
      },
    });
  } catch {
    // The only way this fails for a signed-in user is a wrong current password, and
    // the message says exactly that much and no more.
    return err("UNAUTHORIZED", ar.auth.invalidCredentials);
  }

  // Outside `withTenant`, and that is the whole reason this comment exists.
  //
  // The `user_update` policy admits three callers: no role at all (Better Auth's own
  // writes), a super admin, and a teacher touching their own row. A BRANCH ADMIN is
  // not among them — and a branch admin is exactly who this screen exists for. The
  // previous version ran this update inside a tenant transaction, where RLS silently
  // matched no rows, so the flag never cleared and the admin was returned to this
  // page forever (docs/AUDIT-2026-09.md, finding 12).
  //
  // The fix is not to widen the policy. Letting a branch admin write to their own
  // `user` row means RLS would no longer stop one from changing their own role or
  // branch, and RLS is the layer that is supposed to hold when the code above it is
  // wrong. So this takes the same no-role path Better Auth's own writes take, for one
  // column, on one row, identified by the session rather than by anything the caller
  // sent.
  await db
    .update(user)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(user.id, ctx.userId));

  // The audit row does need a tenant context: `audit_logs` only accepts an insert
  // when `app_role()` is set. It records that a password changed, never what to.
  await withTenant(ctx, async (tx) => {
    await writeAuditLog(
      tx,
      ctx,
      { action: "update", entity: "user.password", entityId: ctx.userId },
      await requestMetadata(),
    );
  });

  return ok({ userId: ctx.userId });
}
