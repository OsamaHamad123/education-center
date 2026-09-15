"use server";

import { eq } from "drizzle-orm";
import { resolveTenantContext } from "@/shared/auth/session";
import { writeAuditLog, requestMetadata } from "@/shared/actions/audit";
import { user } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * Clears the `must_change_password` flag once Better Auth has accepted the new
 * password. Split from the client call because the flag lives on our own column, not
 * in Better Auth's API.
 *
 * Not a `createAction`: it needs no permission (any signed-in user changes their own
 * password) and must work for a super admin in "كافة الفروع" mode, which createAction
 * blocks. It only ever touches the caller's own row.
 */
export async function completePasswordChange(): Promise<Result<{ userId: string }>> {
  const ctx = await resolveTenantContext();
  if (!ctx) return err("UNAUTHORIZED", ar.errors.UNAUTHORIZED);

  await withTenant(ctx, async (tx) => {
    await tx
      .update(user)
      .set({ mustChangePassword: false, updatedAt: new Date() })
      .where(eq(user.id, ctx.userId));

    await writeAuditLog(
      tx,
      ctx,
      { action: "update", entity: "user.password", entityId: ctx.userId },
      await requestMetadata(),
    );
  });

  return ok({ userId: ctx.userId });
}
