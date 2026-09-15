import { requirePermission } from "@/shared/actions/create-action";
import type { CenterSettings } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { ok, type Result } from "@/shared/lib/result";
import { loadSettings } from "../../infrastructure/settings.repository";

export async function getCenterSettings(): Promise<Result<CenterSettings | null>> {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return auth;

  const settings = await withTenant(auth.data, (tx) => loadSettings(auth.data, tx));
  return ok(settings);
}

export type CenterIdentity = { centerName: string; logoPath: string | null };

/**
 * Just the centre's name and logo, for print headers (PROJECT_PLAN section 12).
 *
 * Separate from `getCenterSettings` on purpose: that one is super-admin only because
 * it carries policy (edit windows, alert thresholds, whether the public lookup is on).
 * A branch admin printing a timetable needs the letterhead, not the policy.
 */
export async function getCenterIdentity(): Promise<Result<CenterIdentity>> {
  const auth = await requirePermission("settings.read");
  if (!auth.ok) return auth;

  const settings = await withTenant(auth.data, (tx) => loadSettings(auth.data, tx));
  return ok({
    centerName: settings?.centerName ?? ar.app.name,
    logoPath: settings?.logoPath ?? null,
  });
}
