import { asc, eq } from "drizzle-orm";
import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { branches } from "@/shared/db/schema";
import type { Result } from "@/shared/lib/result";
import { ok } from "@/shared/lib/result";

export type BranchOption = { id: string; name: string; code: string };

/**
 * Branches the current user may see. RLS already narrows this to one row for a branch
 * admin, so the switcher cannot be populated with anything they should not know about.
 */
export async function listVisibleBranches(): Promise<Result<BranchOption[]>> {
  const auth = await requirePermission("branch.read");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) =>
    tx
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(eq(branches.isActive, true))
      .orderBy(asc(branches.name)),
  );

  return ok(rows);
}
