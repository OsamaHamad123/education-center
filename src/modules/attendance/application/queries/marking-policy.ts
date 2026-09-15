import { eq } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { centerSettings } from "@/shared/db/schema";

/**
 * The two centre settings that decide who may write a register
 * (`attendance_edit_window_days`, `teacher_can_mark_attendance`).
 *
 * Read inside the same transaction as the write it governs, so a setting changed
 * mid-request cannot be read as one value and enforced as another. `center_settings`
 * is readable by every role — the policy is not a secret, and the database enforces
 * the teacher half of it in `class_sessions_insert` regardless.
 */
export type MarkingPolicy = {
  editWindowDays: number;
  teacherMarkingEnabled: boolean;
};

/** Conservative defaults: if the row is somehow missing, nobody gets a wide window. */
const FALLBACK: MarkingPolicy = { editWindowDays: 0, teacherMarkingEnabled: false };

export async function loadMarkingPolicy(_ctx: TenantContext, tx: Tx): Promise<MarkingPolicy> {
  const [row] = await tx
    .select({
      editWindowDays: centerSettings.attendanceEditWindowDays,
      teacherMarkingEnabled: centerSettings.teacherCanMarkAttendance,
    })
    .from(centerSettings)
    .where(eq(centerSettings.singleton, true))
    .limit(1);

  return row ?? FALLBACK;
}
