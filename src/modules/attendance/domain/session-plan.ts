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
 *
 * It also records whose lesson it WAS (`drizzle/0020`). Overwriting `teacher_id` and
 * nothing else made the hand-over invisible the moment it happened: the record simply
 * said the lesson had always been the substitute's, and "how many lessons did Ahmad
 * miss, and who covered them" had no answer anywhere in the database.
 */
export function planSubstitution(input: {
  substituteTeacherId: string;
  substituteRates: { scientificPiasters: number; literaryPiasters: number };
  trackApplied: Track;
  /** Who is down to teach it right now — not necessarily whose lesson it started as. */
  currentTeacherId: string;
  /** Who it was taken from on an earlier hand-over, if there was one. */
  substitutedFromTeacherId: string | null;
}): { teacherId: string; rateAppliedPiasters: number; substitutedFromTeacherId: string | null } {
  // The FIRST owner, not the previous one. Ahmad → Khaled → Mona still says Ahmad.
  const origin = input.substitutedFromTeacherId ?? input.currentTeacherId;

  return {
    teacherId: input.substituteTeacherId,
    rateAppliedPiasters: rateFor(input.substituteRates, input.trackApplied),
    // Handed back to the person it started with: there is no longer a substitution to
    // record, and a row saying "taken from Ahmad, taught by Ahmad" would be a lie the
    // CHECK constraint refuses anyway.
    substitutedFromTeacherId: origin === input.substituteTeacherId ? null : origin,
  };
}

export type MakeUpViolation = "ALREADY_MADE_UP" | "DIFFERENT_CLASS" | "BEFORE_ORIGINAL" | "SAME_SESSION";

/**
 * "He taught it on Wednesday instead of Sunday" (`drizzle/0020`).
 *
 * Until this existed, a make-up was recorded as an ordinary extra session and the
 * missed one was left standing — so the centre paid for both. Linking the two is what
 * makes the pair ONE lesson's pay, and the link is what the unique index protects.
 *
 * The teachers are deliberately NOT required to match. A colleague teaching the
 * make-up is the ordinary case when somebody is away for a week, and the person who
 * stood in front of the class is the person payroll owes.
 */
export function checkMakeUp(input: {
  original: { id: string; classId: string; sessionDate: string; madeUpBy: string | null };
  makeUp: { classId: string; sessionDate: string };
}): MakeUpViolation | null {
  if (input.original.madeUpBy !== null) return "ALREADY_MADE_UP";
  // The same students, or it is not making up anything for them.
  if (input.original.classId !== input.makeUp.classId) return "DIFFERENT_CLASS";
  // A lesson cannot be made up before it was missed. Same day is allowed: a morning
  // period moved to the afternoon is exactly this.
  if (input.makeUp.sessionDate < input.original.sessionDate) return "BEFORE_ORIGINAL";
  return null;
}

export type RestoreViolation = "NOT_CANCELLED" | "ALREADY_MADE_UP";

/**
 * Whether a cancelled lesson may be brought back (`drizzle/0020`).
 *
 * The second rule is the one that was missing and is the whole point: a lesson that has
 * already been MADE UP cannot be restored, or the centre pays for both — the double
 * payment arriving by the back door, after the make-up link was supposed to have closed
 * it.
 *
 * Only a make-up that still STANDS counts. Cancel the replacement and this lesson may
 * come back, because then nothing is compensating it — which is also what makes the
 * pair undoable in the order it was made.
 */
export function checkRestore(input: {
  status: "completed" | "cancelled";
  /** The session that makes up for this one, if any, whatever state it is in. */
  makeUp: { status: "completed" | "cancelled" } | null;
}): RestoreViolation | null {
  if (input.status !== "cancelled") return "NOT_CANCELLED";
  if (input.makeUp?.status === "completed") return "ALREADY_MADE_UP";
  return null;
}

/**
 * Whether a make-up needs the missed lesson cancelled first, or it already is.
 *
 * Both are ordinary: the office may cancel on Sunday and record the make-up on
 * Wednesday, or do the whole thing on Wednesday in one go. The one state that must
 * never survive is a completed original WITH a make-up, because that is the double
 * payment.
 */
export function makeUpNeedsCancelling(originalStatus: "completed" | "cancelled"): boolean {
  return originalStatus === "completed";
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
