import { eq } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { branches, centerSettings } from "@/shared/db/schema";

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

/**
 * Everything a message needs: the wording, and the two names that sign it (P4a).
 *
 * Read in the same transaction as the absences it describes, for the same reason the
 * threshold is: a message must not be composed from one version of the settings and
 * labelled with another.
 */
export type MessagingContext = {
  templateDailyAbsence: string;
  templateRepeatedAbsence: string;
  templateLowAttendance: string;
  centerName: string;
  branchName: string;
};

export async function loadMessagingContext(ctx: TenantContext, tx: Tx): Promise<MessagingContext | null> {
  const [settings] = await tx
    .select({
      templateDailyAbsence: centerSettings.templateDailyAbsence,
      templateRepeatedAbsence: centerSettings.templateRepeatedAbsence,
      templateLowAttendance: centerSettings.templateLowAttendance,
      centerName: centerSettings.centerName,
    })
    .from(centerSettings)
    .where(eq(centerSettings.singleton, true))
    .limit(1);
  if (!settings) return null;

  // RLS already narrows this to what the caller may see; the id only picks which one.
  const [branch] = ctx.branchId
    ? await tx.select({ name: branches.name }).from(branches).where(eq(branches.id, ctx.branchId)).limit(1)
    : [];

  return { ...settings, branchName: branch?.name ?? "" };
}
