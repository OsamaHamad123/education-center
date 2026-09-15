"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "@/shared/actions/create-action";
import { ALL_BRANCHES, SELECTED_BRANCH_COOKIE } from "@/shared/config/constants";
import { branches } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";

const schema = z.object({
  branchId: z.union([z.literal(ALL_BRANCHES), z.uuid()]),
});

/**
 * Sets the branch switcher cookie (PROJECT_PLAN section 9).
 *
 * Not a `createAction`: it writes no tenant data and must work in "كافة الفروع" mode,
 * which createAction blocks by design. The permission check is still enforced, and
 * the branch is verified to exist and be active before the cookie is written — the
 * cookie is validated again on every read in `resolveTenantContext`.
 */
export async function selectBranch(raw: unknown): Promise<Result<{ branchId: string | null }>> {
  const auth = await requirePermission("branch.switch");
  if (!auth.ok) return auth;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", ar.errors.VALIDATION_ERROR);

  const store = await cookies();
  const { branchId } = parsed.data;

  if (branchId === ALL_BRANCHES) {
    store.set(SELECTED_BRANCH_COOKIE, ALL_BRANCHES, cookieOptions());
    revalidatePath("/", "layout");
    return ok({ branchId: null });
  }

  const [branch] = await withTenant(auth.data, (tx) =>
    tx
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.isActive, true)))
      .limit(1),
  );
  if (!branch) return err("NOT_FOUND", ar.errors.NOT_FOUND);

  store.set(SELECTED_BRANCH_COOKIE, branch.id, cookieOptions());
  revalidatePath("/", "layout");
  return ok({ branchId: branch.id });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}
