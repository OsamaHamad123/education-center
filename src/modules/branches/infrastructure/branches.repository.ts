import { and, asc, count, eq, ne } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { branches, students, user, type Branch } from "@/shared/db/schema";

/**
 * Every function takes the TenantContext first (CLAUDE.md, "Multi-branch isolation").
 * It is not read here — RLS applies it — but the signature makes it impossible to
 * call a repository from somewhere that has not resolved a tenant, which is the
 * mistake this rule exists to prevent.
 */

export type BranchWithCounts = Branch & {
  studentCount: number;
  adminCount: number;
};

export async function listBranches(_ctx: TenantContext, tx: Tx): Promise<BranchWithCounts[]> {
  const rows = await tx.select().from(branches).orderBy(asc(branches.name));

  // Small, fixed set (a handful of branches), so two grouped counts beat N queries.
  const studentCounts = await tx
    .select({ branchId: students.branchId, total: count() })
    .from(students)
    .where(eq(students.status, "active"))
    .groupBy(students.branchId);

  const adminCounts = await tx
    .select({ branchId: user.branchId, total: count() })
    .from(user)
    .where(eq(user.role, "branch_admin"))
    .groupBy(user.branchId);

  const studentsByBranch = new Map(studentCounts.map((r) => [r.branchId, r.total]));
  const adminsByBranch = new Map(adminCounts.map((r) => [r.branchId, r.total]));

  return rows.map((branch) => ({
    ...branch,
    studentCount: studentsByBranch.get(branch.id) ?? 0,
    adminCount: adminsByBranch.get(branch.id) ?? 0,
  }));
}

export async function findBranchById(_ctx: TenantContext, tx: Tx, id: string): Promise<Branch | null> {
  const [branch] = await tx.select().from(branches).where(eq(branches.id, id)).limit(1);
  return branch ?? null;
}

export async function findBranchByCode(
  _ctx: TenantContext,
  tx: Tx,
  code: string,
  excludeId?: string,
): Promise<Branch | null> {
  const [branch] = await tx
    .select()
    .from(branches)
    .where(excludeId ? and(eq(branches.code, code), ne(branches.id, excludeId)) : eq(branches.code, code))
    .limit(1);
  return branch ?? null;
}

export async function findBranchByName(
  _ctx: TenantContext,
  tx: Tx,
  name: string,
  excludeId?: string,
): Promise<Branch | null> {
  const [branch] = await tx
    .select()
    .from(branches)
    .where(excludeId ? and(eq(branches.name, name), ne(branches.id, excludeId)) : eq(branches.name, name))
    .limit(1);
  return branch ?? null;
}

export async function countStudentsInBranch(_ctx: TenantContext, tx: Tx, branchId: string): Promise<number> {
  const [row] = await tx.select({ total: count() }).from(students).where(eq(students.branchId, branchId));
  return row?.total ?? 0;
}

export async function countActiveBranches(_ctx: TenantContext, tx: Tx): Promise<number> {
  const [row] = await tx.select({ total: count() }).from(branches).where(eq(branches.isActive, true));
  return row?.total ?? 0;
}

export async function insertBranch(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    name: string;
    code: string;
    address?: string | undefined;
    phone?: string | undefined;
    portalEnabled?: boolean | undefined;
  },
): Promise<Branch> {
  const [branch] = await tx
    .insert(branches)
    .values({
      name: values.name,
      code: values.code,
      address: values.address ?? null,
      phone: values.phone ?? null,
      portalEnabled: values.portalEnabled ?? false,
    })
    .returning();
  if (!branch) throw new Error("insertBranch returned no row");
  return branch;
}

export async function updateBranch(
  _ctx: TenantContext,
  tx: Tx,
  id: string,
  values: Partial<{
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    isActive: boolean;
    portalEnabled: boolean;
  }>,
): Promise<Branch | null> {
  const [branch] = await tx
    .update(branches)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(branches.id, id))
    .returning();
  return branch ?? null;
}
