import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
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
    teacherCanMarkAttendance: boolean;
    attendanceEditWindowDays: number;
    absenceAlertThresholdPercent: number;
  },
): Promise<CenterSettings | null> {
  // No WHERE: the table holds exactly one row, enforced by the singleton constraint.
  const [row] = await tx
    .update(centerSettings)
    .set({ ...values, updatedAt: new Date() })
    .returning();
  return row ?? null;
}
