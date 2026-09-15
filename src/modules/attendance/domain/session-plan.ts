/**
 * The snapshot a session takes when it is first written (PROJECT_PLAN 7.13, 10.5).
 *
 * `class_sessions` copies the subject name, the times, the track and the teacher's
 * rate instead of joining to them. That looks like denormalisation and it is: payroll
 * reads these columns, so raising a rate tomorrow must not change what was earned
 * yesterday, and renaming a subject must not rewrite last term's registers.
 *
 * The session is created LAZILY — on the first save, never on merely opening a period
 * — so browsing the timetable does not quietly fill the database with empty sessions
 * that payroll would then count.
 */

export type Track = "scientific" | "literary";

export type PeriodSource = {
  /** Null for an extra or make-up session, which has no weekly slot. */
  timetableSlotId: string | null;
  subjectName: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  teacherId: string;
};

export type SessionSnapshot = {
  timetableSlotId: string | null;
  subjectName: string;
  sessionDate: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  teacherId: string;
  trackApplied: Track;
  rateAppliedPiasters: number;
  isExtra: boolean;
};

export function planSessionSnapshot(input: {
  period: PeriodSource;
  sessionDate: string;
  classTrack: Track;
  /** The teacher's rates AS THEY ARE NOW. Read once, frozen here. */
  teacherRates: { scientificPiasters: number; literaryPiasters: number };
}): SessionSnapshot {
  return {
    timetableSlotId: input.period.timetableSlotId,
    subjectName: input.period.subjectName,
    sessionDate: input.sessionDate,
    periodNumber: input.period.periodNumber,
    startTime: input.period.startTime,
    endTime: input.period.endTime,
    teacherId: input.period.teacherId,
    trackApplied: input.classTrack,
    rateAppliedPiasters: rateFor(input.teacherRates, input.classTrack),
    isExtra: input.period.timetableSlotId === null,
  };
}

/**
 * A substitute takes the session at THEIR OWN rate, not the absent teacher's
 * (rule 10.5). Re-snapshotting is the whole point: the session now belongs to
 * someone else, and payroll must pay the person who actually taught it.
 */
export function planSubstitution(input: {
  substituteTeacherId: string;
  substituteRates: { scientificPiasters: number; literaryPiasters: number };
  trackApplied: Track;
}): { teacherId: string; rateAppliedPiasters: number } {
  return {
    teacherId: input.substituteTeacherId,
    rateAppliedPiasters: rateFor(input.substituteRates, input.trackApplied),
  };
}

export type CancellationViolation = "ALREADY_CANCELLED" | "REASON_REQUIRED";

/**
 * Cancelling keeps the attendance that was already recorded but takes the session out
 * of payroll (rule 10.5). The reason is required because "why was there no lesson"
 * is the first thing a parent asks.
 */
export function validateCancellation(input: {
  status: "completed" | "cancelled";
  reason: string;
}): CancellationViolation | null {
  if (input.status === "cancelled") return "ALREADY_CANCELLED";
  return input.reason.trim().length === 0 ? "REASON_REQUIRED" : null;
}

function rateFor(rates: { scientificPiasters: number; literaryPiasters: number }, track: Track): number {
  return track === "scientific" ? rates.scientificPiasters : rates.literaryPiasters;
}
