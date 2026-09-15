import { cookies, headers } from "next/headers";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { auth } from "./auth";
import { withTenant } from "@/shared/db/with-tenant";
import { branches } from "@/shared/db/schema";
import { ALL_BRANCHES, SELECTED_BRANCH_COOKIE } from "@/shared/config/constants";
import type { Role, TenantContext } from "./tenant-context";

export type SessionUser = {
  id: string;
  name: string;
  username: string | null;
  role: Role;
  branchId: string | null;
  teacherId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
};

/**
 * The signed-in user, or null. Wrapped in React `cache` so a page that asks three
 * times in one render costs one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;

  const u = result.user as typeof result.user & {
    role?: string;
    branchId?: string | null;
    teacherId?: string | null;
    isActive?: boolean;
    mustChangePassword?: boolean;
    username?: string | null;
  };

  // A deactivated account keeps its session row but must not be able to act.
  if (u.isActive === false) return null;
  if (!isRole(u.role)) return null;

  return {
    id: u.id,
    name: u.name,
    username: u.username ?? null,
    role: u.role,
    branchId: u.branchId ?? null,
    teacherId: u.teacherId ?? null,
    isActive: true,
    mustChangePassword: u.mustChangePassword ?? false,
  };
});

/**
 * PROJECT_PLAN 5.3 — resolves the tenant scope of this request.
 *
 * The branch of a branch admin comes from the database row, never from the client.
 * A super admin's selected branch comes from a cookie, and is validated here against
 * a real, active branch before it is trusted — a forged cookie resolves to "all
 * branches", which is read-only, not to someone else's branch.
 */
export const resolveTenantContext = cache(async (): Promise<TenantContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  if (user.role === "branch_admin") {
    if (!user.branchId) return null; // the CHECK constraint makes this unreachable
    return { userId: user.id, role: "branch_admin", branchId: user.branchId, teacherId: null };
  }

  if (user.role === "teacher") {
    if (!user.teacherId) return null;
    return { userId: user.id, role: "teacher", branchId: null, teacherId: user.teacherId };
  }

  return {
    userId: user.id,
    role: "super_admin",
    branchId: await readSelectedBranch(user.id),
    teacherId: null,
  };
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The super admin's selected branch, or null for "كافة الفروع". */
async function readSelectedBranch(userId: string): Promise<string | null> {
  const raw = (await cookies()).get(SELECTED_BRANCH_COOKIE)?.value;
  if (!raw || raw === ALL_BRANCHES) return null;
  // Guard before the query: a non-uuid cookie would make Postgres raise on the cast.
  if (!UUID_PATTERN.test(raw)) return null;

  // The lookup itself needs a tenant context, or RLS returns nothing. We already know
  // from the session that this user is a super admin; only their branch is in question,
  // so the provisional context is "super admin, no branch selected".
  const [branch] = await withTenant({ userId, role: "super_admin", branchId: null, teacherId: null }, (tx) =>
    tx
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, raw), eq(branches.isActive, true)))
      .limit(1),
  );

  // Unknown, inactive or forged id falls back to "all branches", which is read-only.
  // It never falls back to some other branch.
  return branch?.id ?? null;
}

function isRole(value: unknown): value is Role {
  return value === "super_admin" || value === "branch_admin" || value === "teacher";
}
