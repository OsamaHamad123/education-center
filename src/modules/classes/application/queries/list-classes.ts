import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import {
  listActiveClassOptions,
  listClasses as listClassesRepo,
  type ClassWithCounts,
} from "../../infrastructure/classes.repository";

export type ClassOption = { id: string; name: string; branchId: string; track: "scientific" | "literary" };

export async function listClassesForBranch(): Promise<Result<ClassWithCounts[]>> {
  const auth = await requirePermission("class.read");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listClassesRepo(auth.data, tx));
  return ok(rows);
}

/**
 * Active classes for a picker. `branchId` overrides the caller's own scope, which the
 * branch-transfer dialog needs — a super admin picks a class in the TARGET branch.
 */
export async function listClassOptions(branchId?: string): Promise<Result<ClassOption[]>> {
  const auth = await requirePermission("class.read");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listActiveClassOptions(auth.data, tx, branchId));
  return ok(rows);
}

export type { ClassWithCounts };
