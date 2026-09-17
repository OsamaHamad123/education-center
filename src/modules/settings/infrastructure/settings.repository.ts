import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { db } from "@/shared/db/client";
import { centerSettings, type CenterSettings } from "@/shared/db/schema";

/** The single settings row (PROJECT_PLAN 7.17), or null before the seed has run. */
export async function loadSettings(_ctx: TenantContext, tx: Tx): Promise<CenterSettings | null> {
  const [row] = await tx.select().from(centerSettings).limit(1);
  return row ?? null;
}

export async function saveSettings(
  _ctx: TenantContext,
  tx: Tx,
  values: {
    centerName: string;
    lookupEnabled: boolean;
    portalEnabled: boolean;
    teacherCanMarkAttendance: boolean;
    attendanceEditWindowDays: number;
    absenceAlertThresholdPercent: number;
    teacherTravelMinutes: number;
    templateDailyAbsence: string;
    templateRepeatedAbsence: string;
    templateLowAttendance: string;
  },
): Promise<CenterSettings | null> {
  // No WHERE: the table holds exactly one row, enforced by the singleton constraint.
  const [row] = await tx
    .update(centerSettings)
    .set({ ...values, updatedAt: new Date() })
    .returning();
  return row ?? null;
}

/**
 * The centre's name, logo and whether the public lookup is on — read WITHOUT a
 * tenant context, because the one page that needs them has no session.
 *
 * Safe by policy, not by convention: `center_settings_select` is `USING (true)`, so
 * this row is readable by every role including an anonymous request. Nothing on it
 * is branch- or student-specific; the centre's name is on the front of the building.
 */
export async function loadPublicSettings(): Promise<{
  centerName: string;
  logoPath: string | null;
  lookupEnabled: boolean;
  portalEnabled: boolean;
}> {
  const [row] = await db
    .select({
      centerName: centerSettings.centerName,
      logoPath: centerSettings.logoPath,
      lookupEnabled: centerSettings.lookupEnabled,
      portalEnabled: centerSettings.portalEnabled,
    })
    .from(centerSettings)
    .limit(1);

  // Closed by default: before the seed has run there is no centre and no lookup.
  return row ?? { centerName: "", logoPath: null, lookupEnabled: false, portalEnabled: false };
}
