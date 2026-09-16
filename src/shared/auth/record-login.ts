import { eq } from "drizzle-orm";
import { requestMetadata, writeAuditLog } from "@/shared/actions/audit";
import { db } from "@/shared/db/client";
import { user } from "@/shared/db/schema";
import { describeError } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";

/**
 * Audits a successful sign-in (PROJECT_PLAN Phase 2, task 7).
 *
 * Called from Better Auth's session-create hook, which runs before any tenant context
 * exists — so the user's own row is read first to build one. Never throws: a failure
 * to write the audit row must not stop someone from signing in.
 */
export async function recordLogin(userId: string): Promise<void> {
  try {
    // The `user` policy allows a read when app_role() is null: that is the auth path.
    const [row] = await db
      .select({
        id: user.id,
        role: user.role,
        branchId: user.branchId,
        teacherId: user.teacherId,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row) return;

    const ctx = {
      userId: row.id,
      role: row.role,
      branchId: row.branchId,
      teacherId: row.teacherId,
    };

    await withTenant(ctx, async (tx) => {
      await writeAuditLog(
        tx,
        ctx,
        { action: "login", entity: "session.login", entityId: row.id },
        await requestMetadata(),
      );
    });
  } catch (error) {
    console.error("[recordLogin] failed to audit login", describeError(error));
  }
}
