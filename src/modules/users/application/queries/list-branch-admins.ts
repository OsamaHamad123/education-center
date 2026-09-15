import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import {
  listBranchAdmins as listBranchAdminsRepo,
  type BranchAdminRow,
} from "../../infrastructure/users.repository";

export async function listBranchAdminsForAdmin(): Promise<Result<BranchAdminRow[]>> {
  const auth = await requirePermission("user.manage");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listBranchAdminsRepo(auth.data, tx));
  return ok(rows);
}

export type { BranchAdminRow };
