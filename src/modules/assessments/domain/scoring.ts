/**
 * Turning what the browser sent into the marks that should be written
 * (`drizzle/0021`).
 *
 * The same shape as `attendance/domain/roster.ts`, and for the same reason: the
 * ROSTER is the authority, not the payload. A submitted student who is not enrolled
 * in this class is dropped rather than written — without that, a crafted request
 * could attach a mark to a child in another branch, because the row carries its
 * `branch_id` from the assessment and RLS alone would accept it.
 *
 * One difference from attendance, and it matters: there is NO default. An unmarked
 * register means everybody was present; an unmarked exam means nothing at all, and a
 * student with no row has simply not been marked yet.
 */

export type SubmittedScore = {
  studentId: string;
  /** In hundredths. Null when they did not sit it. */
  scoreHundredths: number | null;
  didNotSit: boolean;
  notes: string | null;
};

export type ScoreViolation = "OUT_OF_RANGE" | "ABSENT_WITH_SCORE" | "NEITHER";

/**
 * One mark against the total it was marked out of.
 *
 * Mirrors `assessment_scores_in_range` and `assessment_scores_absent_xor_score`. The
 * constraints are the guarantee; this exists so somebody typing 25 out of 20 is told
 * so in Arabic instead of meeting a violation.
 */
export function checkScore(input: {
  scoreHundredths: number | null;
  didNotSit: boolean;
  maxScoreHundredths: number;
}): ScoreViolation | null {
  if (input.didNotSit) return input.scoreHundredths === null ? null : "ABSENT_WITH_SCORE";
  if (input.scoreHundredths === null) return "NEITHER";
  if (!Number.isInteger(input.scoreHundredths)) return "OUT_OF_RANGE";
  if (input.scoreHundredths < 0 || input.scoreHundredths > input.maxScoreHundredths) {
    return "OUT_OF_RANGE";
  }
  return null;
}

export type ScorePlan = {
  /** Rows to upsert, in roster order. */
  upserts: SubmittedScore[];
  /** Roster students the client did not send. Left UNMARKED — see above. */
  skipped: string[];
  /** Ids that are not on the roster at all. Dropped, and worth an eyebrow. */
  rejected: string[];
  /** The first mark that is not a valid mark, if there is one. */
  violation: { studentId: string; reason: ScoreViolation } | null;
};

export function planScores(
  roster: ReadonlySet<string>,
  submitted: readonly SubmittedScore[],
  maxScoreHundredths: number,
): ScorePlan {
  const byStudent = new Map<string, SubmittedScore>();
  const rejected: string[] = [];
  let violation: ScorePlan["violation"] = null;

  for (const mark of submitted) {
    if (!roster.has(mark.studentId)) {
      rejected.push(mark.studentId);
      continue;
    }
    const reason = checkScore({ ...mark, maxScoreHundredths });
    // The FIRST problem, not a list: the screen highlights one field and says why,
    // and a list of twelve would be a wall nobody reads.
    if (reason && !violation) violation = { studentId: mark.studentId, reason };
    // Last write wins if the payload repeats a student, rather than two rows racing
    // for one unique key.
    byStudent.set(mark.studentId, { ...mark, notes: normalizeNotes(mark.notes) });
  }

  const upserts: SubmittedScore[] = [];
  const skipped: string[] = [];
  for (const studentId of roster) {
    const mark = byStudent.get(studentId);
    if (mark) upserts.push(mark);
    else skipped.push(studentId);
  }

  return { upserts, skipped, rejected, violation };
}

export type ScoreSummary = {
  /** How many of the roster have a mark or an absence recorded. */
  marked: number;
  total: number;
  sat: number;
  didNotSit: number;
  /** Average percent across those who SAT it. Null when nobody has. */
  averagePercent: number | null;
  highestPercent: number | null;
  lowestPercent: number | null;
};

/**
 * The teacher's own sanity check on a sheet they have just entered — a row of
 * eighty-percents with one four-percent in it is usually a typo, not a child.
 *
 * Deliberately NOT what a parent sees. The centre chose on 2026-09-24 that the portal
 * shows a child's own mark and no comparison, and nothing here reaches it.
 */
export function summarizeScores(
  rows: readonly { scoreHundredths: number | null; didNotSit: boolean; maxScoreHundredths: number }[],
  rosterSize: number,
): ScoreSummary {
  const percents: number[] = [];
  let didNotSit = 0;

  for (const row of rows) {
    if (row.didNotSit || row.scoreHundredths === null) {
      didNotSit += 1;
      continue;
    }
    if (row.maxScoreHundredths <= 0) continue;
    percents.push(Math.round((row.scoreHundredths / row.maxScoreHundredths) * 100));
  }

  const sat = percents.length;
  return {
    marked: rows.length,
    total: rosterSize,
    sat,
    didNotSit,
    averagePercent: sat === 0 ? null : Math.round(percents.reduce((a, b) => a + b, 0) / sat),
    highestPercent: sat === 0 ? null : Math.max(...percents),
    lowestPercent: sat === 0 ? null : Math.min(...percents),
  };
}

function normalizeNotes(notes: string | null): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}
