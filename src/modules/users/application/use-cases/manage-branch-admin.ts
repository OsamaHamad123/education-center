"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { z } from "zod";
import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { generateTemporaryPassword } from "../../domain/password";
import {
  findUserById,
  findUserByUsername,
  insertBranchAdmin,
  setUserActive,
  setUserPassword,
} from "../../infrastructure/users.repository";
import { createBranchAdminSchema, setUserActiveSchema, userIdSchema } from "../schemas";

/**
 * Branch admin accounts (PROJECT_PLAN section 9, Phase 3).
 *
 * The temporary password is returned to the caller so the super admin can read it out
 * ONCE. It is never stored in plain text and never written to the audit log — the log
 * records that a reset happened, not what the password was (CLAUDE.md, "Never do").
 */

function newTemporaryPassword(): string {
  return generateTemporaryPassword(randomBytes(16));
}

export const createBranchAdmin = createAction({
  permission: "user.manage",
  schema: createBranchAdminSchema,
  requireBranch: false,
  audit: { action: "create", entity: "user", entityId: (r: { userId: string }) => r.userId },
  revalidate: { paths: ["/users"] },
  handler: async ({ tx, ctx, input }) => {
    const username = input.username.toLowerCase();
    if (await findUserByUsername(ctx, tx, username)) {
      return err("CONFLICT", ar.users.usernameTaken, { username: [ar.users.usernameTaken] });
    }

    const temporaryPassword = newTemporaryPassword();
    const userId = `usr_${randomUUID()}`;

    await insertBranchAdmin(ctx, tx, {
      id: userId,
      name: input.name,
      username,
      // Email is disabled as a sign-in method; Better Auth still requires the column.
      email: `${username}@admins.local`,
      branchId: input.branchId,
      passwordHash: await hashPassword(temporaryPassword),
    });

    return ok({ userId, username, temporaryPassword });
  },
});

export const resetBranchAdminPassword = createAction({
  permission: "user.manage",
  schema: userIdSchema,
  requireBranch: false,
  audit: { action: "update", entity: "user.password_reset", entityId: (r: { userId: string }) => r.userId },
  revalidate: { paths: ["/users"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findUserById(ctx, tx, input.id);
    if (!existing || existing.role !== "branch_admin") {
      return err("NOT_FOUND", ar.errors.NOT_FOUND);
    }

    const temporaryPassword = newTemporaryPassword();
    await setUserPassword(ctx, tx, input.id, await hashPassword(temporaryPassword));

    return ok({ userId: input.id, username: existing.displayUsername ?? "", temporaryPassword });
  },
});

export const setBranchAdminActive = createAction({
  permission: "user.manage",
  schema: setUserActiveSchema,
  requireBranch: false,
  audit: { action: "update", entity: "user.status", entityId: (r: { userId: string }) => r.userId },
  revalidate: { paths: ["/users"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findUserById(ctx, tx, input.id);
    if (!existing || existing.role !== "branch_admin") {
      return err("NOT_FOUND", ar.errors.NOT_FOUND);
    }
    if (existing.isActive === input.isActive) {
      return err("CONFLICT", ar.users.statusUnchanged);
    }

    await setUserActive(ctx, tx, input.id, input.isActive);
    return ok({ userId: input.id, isActive: input.isActive });
  },
});

/** Exported for the form's client-side validation. */
export type CreateBranchAdminInput = z.input<typeof createBranchAdminSchema>;
