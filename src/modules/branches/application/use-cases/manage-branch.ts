"use server";

import { createAction } from "@/shared/actions/create-action";
import type { Branch } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { canChangeBranchCode, canDeactivateBranch, normalizeBranchCode } from "../../domain/rules";
import {
  countActiveBranches,
  countStudentsInBranch,
  findBranchByCode,
  findBranchById,
  findBranchByName,
  insertBranch,
  updateBranch,
} from "../../infrastructure/branches.repository";
import { createBranchSchema, setBranchActiveSchema, updateBranchSchema } from "../schemas";

/**
 * Branch management (PROJECT_PLAN 10.1). Super admin only — enforced by the
 * `branch.manage` permission, and again by the `branches_*` RLS policies.
 *
 * `requireBranch: false` on all three: creating or renaming a branch is not scoped
 * to a branch, and a super admin is usually in "كافة الفروع" mode when they do it.
 */

export const createBranch = createAction({
  permission: "branch.manage",
  schema: createBranchSchema,
  requireBranch: false,
  audit: { action: "create", entity: "branch", entityId: (branch: Branch) => branch.id },
  revalidate: { paths: ["/branches", "/"] },
  handler: async ({ tx, ctx, input }) => {
    const code = normalizeBranchCode(input.code);

    if (await findBranchByCode(ctx, tx, code)) {
      return err("CONFLICT", ar.branches.codeTaken, { code: [ar.branches.codeTaken] });
    }
    if (await findBranchByName(ctx, tx, input.name)) {
      return err("CONFLICT", ar.branches.nameTaken, { name: [ar.branches.nameTaken] });
    }

    const branch = await insertBranch(ctx, tx, {
      name: input.name,
      code,
      address: input.address,
      phone: input.phone,
    });
    return ok(branch);
  },
});

export const editBranch = createAction({
  permission: "branch.manage",
  schema: updateBranchSchema,
  requireBranch: false,
  audit: { action: "update", entity: "branch", entityId: (branch: Branch) => branch.id },
  revalidate: { paths: ["/branches", "/"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findBranchById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const code = normalizeBranchCode(input.code);

    // The code is frozen once a student code has been issued from it (rule 10.1).
    if (code !== existing.code) {
      const studentCount = await countStudentsInBranch(ctx, tx, input.id);
      if (canChangeBranchCode({ studentCount })) {
        return err("CONFLICT", ar.branches.codeLocked, { code: [ar.branches.codeLocked] });
      }
      if (await findBranchByCode(ctx, tx, code, input.id)) {
        return err("CONFLICT", ar.branches.codeTaken, { code: [ar.branches.codeTaken] });
      }
    }

    if (input.name !== existing.name && (await findBranchByName(ctx, tx, input.name, input.id))) {
      return err("CONFLICT", ar.branches.nameTaken, { name: [ar.branches.nameTaken] });
    }

    const updated = await updateBranch(ctx, tx, input.id, {
      name: input.name,
      code,
      address: input.address ?? null,
      phone: input.phone ?? null,
    });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const setBranchActive = createAction({
  permission: "branch.manage",
  schema: setBranchActiveSchema,
  requireBranch: false,
  audit: { action: "update", entity: "branch.status", entityId: (branch: Branch) => branch.id },
  revalidate: { paths: ["/branches", "/"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findBranchById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    if (!input.isActive) {
      const violation = canDeactivateBranch({
        activeStudentCount: await countStudentsInBranch(ctx, tx, input.id),
        activeBranchCount: await countActiveBranches(ctx, tx),
        isCurrentlyActive: existing.isActive,
      });
      if (violation === "LAST_ACTIVE_BRANCH") return err("CONFLICT", ar.branches.lastActiveBranch);
      if (violation === "BRANCH_ALREADY_INACTIVE") return err("CONFLICT", ar.branches.alreadyInactive);
    }

    const updated = await updateBranch(ctx, tx, input.id, { isActive: input.isActive });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});
