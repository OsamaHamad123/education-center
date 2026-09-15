import { sql } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import { db, type Tx } from "./client";

/**
 * PROJECT_PLAN 5.4 — runs `fn` inside a transaction whose settings the RLS policies read.
 *
 * Two details matter and are easy to get wrong:
 *
 *  - `set_config(..., true)` makes the setting TRANSACTION-local. With a connection
 *    pool, a session-local setting would leak one user's branch onto the next
 *    request that happens to reuse the connection.
 *  - Empty string, not NULL, is written for an absent branch/teacher, because
 *    `current_setting(..., true)` returns '' for unset and the helper functions
 *    turn '' back into NULL. A super admin in "كافة الفروع" mode therefore gets
 *    `app_branch_id() is null`, which the policies read as "all branches, read only".
 */
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.user_role', ${ctx.role}, true),
      set_config('app.branch_id', ${ctx.branchId ?? ""}, true),
      set_config('app.teacher_id', ${ctx.teacherId ?? ""}, true)`);
    return fn(tx);
  });
}
