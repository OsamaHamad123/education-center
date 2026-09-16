/**
 * Attendance arithmetic (PROJECT_PLAN 10.7).
 *
 * One decision runs through all of it and it is a policy, not a detail: only
 * `absent` counts against a student. `late` and `excused` mean they were accounted
 * for, and a centre that counted an excused absence against a child would be
 * answering the wrong question to the parent asking it.
 *
 * All percentages are whole numbers, rounded once, at the end. Rounding twice — per
 * class and again per branch — is how a report ends up disagreeing with itself.
 */

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export type StatusCounts = {
  present: number;
  absent: number;
  late: number;
  excused: number;
};

export const ZERO_COUNTS: StatusCounts = { present: 0, absent: 0, late: 0, excused: 0 };

export function totalOf(counts: StatusCounts): number {
  return counts.present + counts.absent + counts.late + counts.excused;
}

/** The share of recorded sessions a student was NOT absent from, 0–100. */
export function attendanceRate(counts: StatusCounts): number {
  const total = totalOf(counts);
  if (total === 0) return 0;
  return Math.round(((total - counts.absent) / total) * 100);
}

/** The mirror of `attendanceRate`; the two always add to 100. */
export function absenceRate(counts: StatusCounts): number {
  const total = totalOf(counts);
  if (total === 0) return 0;
  return 100 - attendanceRate(counts);
}

export function addCounts(a: StatusCounts, b: StatusCounts): StatusCounts {
  return {
    present: a.present + b.present,
    absent: a.absent + b.absent,
    late: a.late + b.late,
    excused: a.excused + b.excused,
  };
}

export function countsFrom(statuses: readonly AttendanceStatus[]): StatusCounts {
  const counts = { ...ZERO_COUNTS };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

export type AlertCandidate<T> = {
  subject: T;
  counts: StatusCounts;
};

export type Alert<T> = {
  subject: T;
  counts: StatusCounts;
  absencePercent: number;
  total: number;
};

/**
 * Students whose absence is at or above the centre's threshold (rule 10.7).
 *
 * `minSessions` is not in the plan but the report is useless without it: a student
 * with one recorded session and one absence is at 100%, and an alert list topped by
 * arithmetic accidents is an alert list nobody reads. The default is stated at the
 * call site so it is a visible policy, not a hidden one.
 */
export function absenceAlerts<T>(
  candidates: readonly AlertCandidate<T>[],
  thresholdPercent: number,
  minSessions: number,
): Alert<T>[] {
  return candidates
    .map((candidate) => ({
      subject: candidate.subject,
      counts: candidate.counts,
      absencePercent: absenceRate(candidate.counts),
      total: totalOf(candidate.counts),
    }))
    .filter((alert) => alert.total >= minSessions && alert.absencePercent >= thresholdPercent)
    .sort((a, b) => b.absencePercent - a.absencePercent || b.counts.absent - a.counts.absent);
}
