/**
 * Who was absent WITHOUT permission, and from which lesson (asked for 2026-09-24).
 *
 * The centre asked for "a student who misses one period without permission — his name
 * and the period he missed". The data for it has existed since Phase 7: attendance is
 * recorded per SESSION, not per day, and `absent` and `excused` have always been
 * separate statuses. What was missing was anything that read them that way — the
 * register matrix folded a day into one cell, and the alerts screen only shows a
 * student once they cross a percentage.
 *
 * A percentage is the wrong instrument for this question. A boy who missed one lesson
 * out of forty is at 2.5%, under every threshold the centre would set, and his father
 * still wants to know. So this counts nothing and hides nothing: one period missed
 * without permission is one line.
 *
 * Pure, and shared by three screens — the branch dashboard, the teacher's own day and
 * the report — so "unexcused" means one thing in all three.
 */

export type AbsenceRow = {
  studentId: string;
  fullName: string;
  studentCode: string;
  classId: string;
  className: string;
  sessionId: string;
  sessionDate: string;
  periodNumber: number;
  subjectName: string;
  teacherName: string;
};

export type StudentAbsences = {
  studentId: string;
  fullName: string;
  studentCode: string;
  className: string;
  /** Every period missed, newest day first, then by period within the day. */
  entries: AbsenceRow[];
  count: number;
};

/**
 * One line per student, with the lessons under the name.
 *
 * A student missing three periods of one day is ONE person to ring, not three — and
 * the three periods are what the call is about. Flattening them into three rows would
 * make a morning of one absent class look like a crisis.
 */
export function groupAbsences(rows: readonly AbsenceRow[]): StudentAbsences[] {
  const byStudent = new Map<string, StudentAbsences>();

  for (const row of rows) {
    const existing = byStudent.get(row.studentId);
    if (existing) {
      existing.entries.push(row);
      existing.count += 1;
      continue;
    }
    byStudent.set(row.studentId, {
      studentId: row.studentId,
      fullName: row.fullName,
      studentCode: row.studentCode,
      className: row.className,
      entries: [row],
      count: 1,
    });
  }

  for (const student of byStudent.values()) {
    student.entries.sort(compareEntries);
  }

  // Most absences first: the list is a worklist, and the top of it is the call to make
  // first. Ties fall back to the name so the order is stable between two loads.
  return [...byStudent.values()].sort(
    (a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName, "ar"),
  );
}

function compareEntries(a: AbsenceRow, b: AbsenceRow): number {
  if (a.sessionDate !== b.sessionDate) return b.sessionDate.localeCompare(a.sessionDate);
  return a.periodNumber - b.periodNumber;
}

/**
 * "الحصص ٢، ٣ و٥" for one day, or the plain period number for a single one.
 *
 * Consecutive periods are RANGED — 2, 3, 4 reads as ٢–٤ — because that is the shape
 * that tells the office something: three in a row is a boy who went home, three
 * scattered across the day is a boy avoiding three subjects, and those are different
 * conversations.
 */
export function describePeriodRuns(periods: readonly number[]): string {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const runs: string[] = [];
  let start = sorted[0] as number;
  let previous = start;

  for (const period of sorted.slice(1)) {
    if (period === previous + 1) {
      previous = period;
      continue;
    }
    runs.push(formatRun(start, previous));
    start = period;
    previous = period;
  }
  runs.push(formatRun(start, previous));

  return runs.join("، ");
}

function formatRun(start: number, end: number): string {
  if (start === end) return String(start);
  // A run of exactly two is not a range; "٢، ٣" is shorter to read than "٢–٣".
  if (end === start + 1) return `${start}، ${end}`;
  return `${start}–${end}`;
}

/** Every distinct day a student was absent in the set — what a summary line counts. */
export function daysAbsent(entries: readonly AbsenceRow[]): number {
  return new Set(entries.map((entry) => entry.sessionDate)).size;
}
