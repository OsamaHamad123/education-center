import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import type { Track } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { DEFAULT_WORKING_DAYS } from "@/shared/lib/time";
import { computePeriods, type BellBreak, type ComputedPeriod } from "../../domain/compute-periods";
import { findScheduleSettings } from "../../infrastructure/timetable.repository";

export type TrackSchedule = {
  track: Track;
  dayStartTime: string;
  periodDurationMin: number;
  periodsCount: number;
  workingDays: number[];
  breaks: BellBreak[];
  periods: ComputedPeriod[];
  /** False when this branch has never configured the track — the form starts blank. */
  configured: boolean;
};

const TRACKS: Track[] = ["scientific", "literary"];

/** Sensible defaults so a brand-new branch sees a working day, not an empty form. */
const FALLBACK = {
  dayStartTime: "08:00",
  periodDurationMin: 45,
  periodsCount: 6,
  workingDays: [...DEFAULT_WORKING_DAYS],
};

/** The bell schedule of both tracks in the active branch, with periods already computed. */
export async function getScheduleSettings(): Promise<Result<TrackSchedule[]>> {
  const auth = await requirePermission("timetable.settings");
  if (!auth.ok) return auth;

  const branchId = auth.data.branchId;
  if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const schedules = await withTenant(auth.data, async (tx) => {
    const result: TrackSchedule[] = [];
    for (const track of TRACKS) {
      const settings = await findScheduleSettings(auth.data, tx, branchId, track);
      result.push(toTrackSchedule(track, settings));
    }
    return result;
  });

  return ok(schedules);
}

function toTrackSchedule(
  track: Track,
  settings: Awaited<ReturnType<typeof findScheduleSettings>>,
): TrackSchedule {
  const shape = settings
    ? {
        dayStartTime: settings.dayStartTime.slice(0, 5),
        periodDurationMin: settings.periodDurationMin,
        periodsCount: settings.periodsCount,
        workingDays: settings.workingDays,
        breaks: settings.breaks,
      }
    : { ...FALLBACK, breaks: [] as BellBreak[] };

  return {
    track,
    ...shape,
    periods: computePeriods(shape),
    configured: settings !== null,
  };
}
