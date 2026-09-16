import { describe, expect, it } from "vitest";
import {
  absenceAlerts,
  absenceRate,
  addCounts,
  attendanceRate,
  countsFrom,
  totalOf,
  ZERO_COUNTS,
  type StatusCounts,
} from "./attendance-rates";

function counts(overrides: Partial<StatusCounts> = {}): StatusCounts {
  return { ...ZERO_COUNTS, ...overrides };
}

describe("attendanceRate", () => {
  it("counts only absence against a student", () => {
    // Present, late and excused all mean the student was accounted for.
    expect(attendanceRate(counts({ present: 1, late: 1, excused: 1, absent: 1 }))).toBe(75);
  });

  it("is 100 for a student who never missed a session", () => {
    expect(attendanceRate(counts({ present: 10 }))).toBe(100);
  });

  it("is 0 for a student who missed every one", () => {
    expect(attendanceRate(counts({ absent: 4 }))).toBe(0);
  });

  it("is 0, not NaN, when nothing has been recorded", () => {
    expect(attendanceRate(ZERO_COUNTS)).toBe(0);
  });

  it("rounds to a whole percent", () => {
    expect(attendanceRate(counts({ present: 2, absent: 1 }))).toBe(67);
  });
});

describe("absenceRate", () => {
  it("is exactly the complement, so a report never disagrees with itself", () => {
    for (const sample of [
      counts({ present: 2, absent: 1 }),
      counts({ present: 1, absent: 2 }),
      counts({ present: 7, late: 1, absent: 3 }),
      counts({ excused: 5 }),
    ]) {
      expect(attendanceRate(sample) + absenceRate(sample)).toBe(100);
    }
  });

  it("is 0 for an empty record rather than 100", () => {
    expect(absenceRate(ZERO_COUNTS)).toBe(0);
  });
});

describe("countsFrom and addCounts", () => {
  it("tallies a list of statuses", () => {
    expect(countsFrom(["present", "absent", "present", "late"])).toEqual({
      present: 2,
      absent: 1,
      late: 1,
      excused: 0,
    });
  });

  it("adds two tallies without mutating either", () => {
    const a = counts({ present: 1 });
    const b = counts({ absent: 2 });

    expect(addCounts(a, b)).toEqual(counts({ present: 1, absent: 2 }));
    expect(a).toEqual(counts({ present: 1 }));
  });

  it("totals every status, not just the good ones", () => {
    expect(totalOf(counts({ present: 1, absent: 2, late: 3, excused: 4 }))).toBe(10);
  });
});

describe("absenceAlerts", () => {
  const students = [
    { subject: "منتظم", counts: counts({ present: 19, absent: 1 }) },
    { subject: "متعثر", counts: counts({ present: 12, absent: 8 }) },
    { subject: "غائب كثيراً", counts: counts({ present: 5, absent: 15 }) },
  ];

  it("lists only students at or above the threshold", () => {
    const alerts = absenceAlerts(students, 25, 5);
    expect(alerts.map((alert) => alert.subject)).toEqual(["غائب كثيراً", "متعثر"]);
  });

  it("includes a student exactly ON the threshold", () => {
    const alerts = absenceAlerts(
      [{ subject: "على الحد", counts: counts({ present: 15, absent: 5 }) }],
      25,
      5,
    );
    expect(alerts).toHaveLength(1);
  });

  it("sorts worst first, so the list is read from the top", () => {
    expect(absenceAlerts(students, 1, 1).map((alert) => alert.absencePercent)).toEqual([75, 40, 5]);
  });

  it("ignores a student with too few recorded sessions to mean anything", () => {
    // One absence out of one session is 100% and tells nobody anything useful.
    const alerts = absenceAlerts([{ subject: "جديد", counts: counts({ absent: 1 }) }], 25, 5);
    expect(alerts).toEqual([]);
  });

  it("breaks a tie on the raw number of absences", () => {
    const alerts = absenceAlerts(
      [
        { subject: "قليل", counts: counts({ present: 5, absent: 5 }) },
        { subject: "كثير", counts: counts({ present: 10, absent: 10 }) },
      ],
      25,
      5,
    );

    expect(alerts.map((alert) => alert.subject)).toEqual(["كثير", "قليل"]);
  });

  it("is empty when nobody qualifies", () => {
    expect(absenceAlerts(students, 99, 5)).toEqual([]);
  });
});
