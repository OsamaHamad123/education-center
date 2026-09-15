import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import type { Result } from "@/shared/lib/result";
import { ok } from "@/shared/lib/result";
import {
  listBranches as listBranchesRepo,
  type BranchWithCounts,
} from "../../infrastructure/branches.repository";

/** The full branch list for the management screen, with the counts it displays. */
export async function listBranchesForAdmin(): Promise<Result<BranchWithCounts[]>> {
  const auth = await requirePermission("branch.manage");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listBranchesRepo(auth.data, tx));
  return ok(rows);
}

export type { BranchWithCounts };
