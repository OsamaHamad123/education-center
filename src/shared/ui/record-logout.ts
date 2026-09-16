"use server";

import { requestMetadata, writeAuditLog } from "@/shared/actions/audit";
import { resolveTenantContext } from "@/shared/auth/session";
import { describeError } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";

/**
 * Audits a logout (PROJECT_PLAN Phase 2, task 7). Called before the session is
 * destroyed, because afterwards there is no tenant context to attribute it to.
 * Never throws: failing to log a logout must not prevent the logout.
 */
export async function recordLogout(): Promise<void> {
  try {
    const ctx = await resolveTenantContext();
    if (!ctx) return;
    await withTenant(ctx, async (tx) => {
      await writeAuditLog(tx, ctx, { action: "login", entity: "session.logout" }, await requestMetadata());
    });
  } catch (error) {
    console.error("[recordLogout] failed to audit logout", describeError(error));
  }
}
