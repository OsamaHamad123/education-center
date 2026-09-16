import { eq } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { centerSettings } from "@/shared/db/schema";

/**
 * The absence threshold the centre configured (rule 10.7). Read inside the same
 * transaction as the report it governs, so a report can never be computed against one
 * threshold and labelled with another.
 */
export type AlertSettings = { absenceAlertThresholdPercent: number };

/** The schema's own default, so a missing settings row does not mean "alert nobody". */
const FALLBACK: AlertSettings = { absenceAlertThresholdPercent: 25 };

export async function loadAlertSettings(_ctx: TenantContext, tx: Tx): Promise<AlertSettings> {
  const [row] = await tx
    .select({ absenceAlertThresholdPercent: centerSettings.absenceAlertThresholdPercent })
    .from(centerSettings)
    .where(eq(centerSettings.singleton, true))
    .limit(1);

  return row ?? FALLBACK;
}
