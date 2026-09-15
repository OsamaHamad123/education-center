import { and, asc, eq } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { account, branches, session, user } from "@/shared/db/schema";

export type BranchAdminRow = {
  id: string;
  name: string;
  username: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  branchId: string | null;
  branchName: string | null;
  createdAt: Date;
};

export async function listBranchAdmins(_ctx: TenantContext, tx: Tx): Promise<BranchAdminRow[]> {
  return tx
    .select({
      id: user.id,
      name: user.name,
      username: user.displayUsername,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      branchId: user.branchId,
      branchName: branches.name,
      createdAt: user.createdAt,
    })
    .from(user)
    .leftJoin(branches, eq(branches.id, user.branchId))
    .where(eq(user.role, "branch_admin"))
    .orderBy(asc(user.name));
}

export async function findUserById(_ctx: TenantContext, tx: Tx, id: string) {
  const [row] = await tx.select().from(user).where(eq(user.id, id)).limit(1);
  return row ?? null;
}

export async function findUserByUsername(_ctx: TenantContext, tx: Tx, username: string) {
  const [row] = await tx.select().from(user).where(eq(user.username, username)).limit(1);
  return row ?? null;
}

export async function insertBranchAdmin(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    id: string;
    name: string;
    username: string;
    email: string;
    branchId: string;
    passwordHash: string;
  },
): Promise<void> {
  await tx.insert(user).values({
    id: values.id,
    name: values.name,
    email: values.email,
    emailVerified: true,
    username: values.username,
    displayUsername: values.username,
    role: "branch_admin",
    branchId: values.branchId,
    // A temporary password is shown once; the first login forces a change.
    mustChangePassword: true,
  });

  await tx.insert(account).values({
    id: `acc_${values.id}`,
    accountId: values.id,
    providerId: "credential",
    userId: values.id,
    password: values.passwordHash,
  });
}

export async function setUserPassword(
  _ctx: TenantContext,
  tx: Tx,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await tx
    .update(account)
    .set({ password: passwordHash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));

  await tx.update(user).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(user.id, userId));

  // A reset must end every session that password opened, on every device.
  await revokeSessions(_ctx, tx, userId);
}

export async function setUserActive(
  _ctx: TenantContext,
  tx: Tx,
  userId: string,
  isActive: boolean,
): Promise<void> {
  await tx.update(user).set({ isActive, updatedAt: new Date() }).where(eq(user.id, userId));
  if (!isActive) await revokeSessions(_ctx, tx, userId);
}

/** Deactivating or resetting must not leave a live session behind. */
export async function revokeSessions(_ctx: TenantContext, tx: Tx, userId: string): Promise<void> {
  await tx.delete(session).where(eq(session.userId, userId));
}
