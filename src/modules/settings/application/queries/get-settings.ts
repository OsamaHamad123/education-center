import { requirePermission } from "@/shared/actions/create-action";
import type { CenterSettings } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import { loadSettings } from "../../infrastructure/settings.repository";

export async function getCenterSettings(): Promise<Result<CenterSettings | null>> {
  const auth = await requirePermission("settings.manage");
  if (!auth.ok) return auth;

  const settings = await withTenant(auth.data, (tx) => loadSettings(auth.data, tx));
  return ok(settings);
}
