/**
 * Who is on the register, and what gets written when it is saved
 * (PROJECT_PLAN 10.5).
 *
 * "Students listed = active students whose enrollment covers `session_date` in that
 * class" is the rule, and it is not the same as `students.class_id`. A student who
 * moved to another class in March must still appear on February's register, and must
 * NOT appear on March's for the class they left — otherwise last month's attendance
 * percentage silently changes every time somebody switches class.
 */

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

/** One enrolment row: where a student was, and for how long. */
export type EnrollmentPeriod = {
  studentId: string;
  classId: string;
  /** `yyyy-MM-dd`, inclusive. */
  startDate: string;
  /** `yyyy-MM-dd`, inclusive, or null while the enrolment is open. */
  endDate: string | null;
};

export function enrollmentCovers(period: EnrollmentPeriod, date: string): boolean {
  if (date < period.startDate) return false;
  return period.endDate === null || date <= period.endDate;
}

/** The student ids who belong on this class's register for this day. */
export function rosterFor(
  enrollments: readonly EnrollmentPeriod[],
  classId: string,
  date: string,
): Set<string> {
  const ids = new Set<string>();
  for (const period of enrollments) {
    if (period.classId === classId && enrollmentCovers(period, date)) ids.add(period.studentId);
  }
  return ids;
}

export type SubmittedMark = {
  studentId: string;
  status: AttendanceStatus;
  notes: string | null;
};

export type AttendancePlan = {
  /** Rows to upsert, in roster order. */
  upserts: SubmittedMark[];
  /** Roster students the client did not send — saved as present (rule 10.5). */
  defaulted: string[];
  /** Ids that are not on the roster at all. Dropped, and worth an eyebrow. */
  rejected: string[];
};

/**
 * Turns what the browser sent into what should be written.
 *
 * The roster is the authority, not the payload: a submitted id that is not enrolled
 * in this class on this day is DROPPED rather than written. Without that, a crafted
 * request could attach an attendance row to a student in another branch — the row
 * carries `branch_id` from the session, so RLS alone would happily accept it.
 */
export function planAttendance(
  roster: ReadonlySet<string>,
  submitted: readonly SubmittedMark[],
): AttendancePlan {
  const byStudent = new Map<string, SubmittedMark>();
  const rejected: string[] = [];

  for (const mark of submitted) {
    if (!roster.has(mark.studentId)) {
      rejected.push(mark.studentId);
      continue;
    }
    // Last write wins if the payload repeats a student, rather than two rows racing
    // for one unique key.
    byStudent.set(mark.studentId, mark);
  }

  const upserts: SubmittedMark[] = [];
  const defaulted: string[] = [];

  for (const studentId of roster) {
    const mark = byStudent.get(studentId);
    if (mark) {
      upserts.push({ ...mark, notes: normalizeNotes(mark.notes) });
      continue;
    }
    // "Default all students to present" is not a UI convenience — it is what makes a
    // full class one tap, so it has to hold on the server too.
    defaulted.push(studentId);
    upserts.push({ studentId, status: "present", notes: null });
  }

  return { upserts, defaulted, rejected };
}

/** One tap moves to the next status (rule 10.5). Absent is deliberately first. */
const CYCLE: readonly AttendanceStatus[] = ["present", "absent", "late", "excused"];

export function nextStatus(current: AttendanceStatus): AttendanceStatus {
  const index = CYCLE.indexOf(current);
  return CYCLE[(index + 1) % CYCLE.length] ?? "present";
}

export type AttendanceSummary = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  /** Attending = present + late + excused; only `absent` counts against a student. */
  attendedPercent: number;
};

export function summarize(statuses: readonly AttendanceStatus[]): AttendanceSummary {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const status of statuses) counts[status] += 1;

  const total = statuses.length;
  const attended = total - counts.absent;

  return {
    ...counts,
    total,
    attendedPercent: total === 0 ? 0 : Math.round((attended / total) * 100),
  };
}

function normalizeNotes(notes: string | null): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}
