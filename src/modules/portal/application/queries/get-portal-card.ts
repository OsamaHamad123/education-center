import { eq } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "@/shared/actions/create-action";
import { env } from "@/shared/config/env";
import { branches } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";

/**
 * What the office prints and hands to a parent (docs/PARENT-PORTAL-PLAN.md, P7).
 *
 * The plan's rollout bullet is "a printed card: the URL, what it does, and the office's
 * number when it does not" — the last clause being the important one. A family that
 * cannot get in and has nobody to ring is a family that decides the centre's system does
 * not work, and tells the other parents so.
 *
 * Read inside `withTenant`, so a branch admin can only ever ask for their own branch and
 * a foreign id is a 404 rather than an explanation (CLAUDE.md, isolation).
 */

export type PortalCard = {
  branchName: string;
  branchPhone: string | null;
  /** Shown on the card in full, because a parent types it by hand off paper. */
  portalUrl: string;
  portalEnabled: boolean;
};

export async function getPortalCard(branchId: string): Promise<Result<PortalCard>> {
  if (!z.uuid().safeParse(branchId).success) return err("NOT_FOUND", ar.errors.NOT_FOUND);

  const auth = await requirePermission("branch.read");
  if (!auth.ok) return auth;

  const [branch] = await withTenant(auth.data, (tx) =>
    tx
      .select({
        name: branches.name,
        phone: branches.phone,
        portalEnabled: branches.portalEnabled,
        isActive: branches.isActive,
      })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1),
  );
  if (!branch || !branch.isActive) return err("NOT_FOUND", ar.errors.NOT_FOUND);

  // Cards for a branch that is not in the rollout are refused, and that is the point:
  // a card is a promise that the URL works, and printing one before the switch is on is
  // how a staged rollout turns into a morning of phone calls.
  if (!branch.portalEnabled) return err("NOT_FOUND", ar.errors.NOT_FOUND);

  return ok({
    branchName: branch.name,
    branchPhone: branch.phone,
    // The origin the app is actually served from. Nothing else in the product knows the
    // public URL, and a card with the wrong one is worse than no card.
    portalUrl: `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/portal`,
    portalEnabled: branch.portalEnabled,
  });
}
