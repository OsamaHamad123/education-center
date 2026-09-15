import { describe, expect, it } from "vitest";
import {
  enrollmentCovers,
  nextStatus,
  planAttendance,
  rosterFor,
  summarize,
  type EnrollmentPeriod,
  type SubmittedMark,
} from "./roster";

const CLASS_A = "class-a";
const CLASS_B = "class-b";

function period(overrides: Partial<EnrollmentPeriod> = {}): EnrollmentPeriod {
  return {
    studentId: "s1",
    classId: CLASS_A,
    startDate: "2026-09-01",
    endDate: null,
    ...overrides,
  };
}

describe("enrollmentCovers", () => {
  it("includes the first and last day", () => {
    const closed = period({ endDate: "2026-09-30" });
    expect(enrollmentCovers(closed, "2026-09-01")).toBe(true);
    expect(enrollmentCovers(closed, "2026-09-30")).toBe(true);
  });

  it("excludes the day before and the day after", () => {
    const closed = period({ endDate: "2026-09-30" });
    expect(enrollmentCovers(closed, "2026-08-31")).toBe(false);
    expect(enrollmentCovers(closed, "2026-10-01")).toBe(false);
  });

  it("treats an open enrolment as running forever", () => {
    expect(enrollmentCovers(period(), "2030-01-01")).toBe(true);
  });
});

describe("rosterFor", () => {
  it("is the students enrolled in THIS class on THIS day", () => {
    const roster = rosterFor(
      [
        period({ studentId: "s1" }),
        period({ studentId: "s2", classId: CLASS_B }),
        period({ studentId: "s3", startDate: "2026-09-20" }),
      ],
      CLASS_A,
      "2026-09-16",
    );

    expect([...roster]).toEqual(["s1"]);
  });

  it("keeps a student who has since MOVED on the register of the day they were there", () => {
    // This is the whole reason the roster comes from enrolments and not students.class_id:
    // February's attendance percentage must not change because somebody switched in March.
    const enrollments = [
      period({ studentId: "s1", startDate: "2026-01-05", endDate: "2026-02-28" }),
      period({ studentId: "s1", classId: CLASS_B, startDate: "2026-03-01" }),
    ];

    expect([...rosterFor(enrollments, CLASS_A, "2026-02-10")]).toEqual(["s1"]);
    expect([...rosterFor(enrollments, CLASS_A, "2026-03-10")]).toEqual([]);
    expect([...rosterFor(enrollments, CLASS_B, "2026-03-10")]).toEqual(["s1"]);
  });

  it("is empty for a day nobody was enrolled", () => {
    expect(rosterFor([period({ startDate: "2026-09-10" })], CLASS_A, "2026-09-01").size).toBe(0);
  });
});

describe("planAttendance", () => {
  const roster = new Set(["s1", "s2", "s3"]);

  it("defaults every unsent student to present", () => {
    const plan = planAttendance(roster, [{ studentId: "s2", status: "absent", notes: null }]);

    expect(plan.upserts).toEqual([
      { studentId: "s1", status: "present", notes: null },
      { studentId: "s2", status: "absent", notes: null },
      { studentId: "s3", status: "present", notes: null },
    ]);
    expect(plan.defaulted).toEqual(["s1", "s3"]);
  });

  it("writes a whole class present from an empty payload — the one-tap case", () => {
    const plan = planAttendance(roster, []);

    expect(plan.upserts.map((mark) => mark.status)).toEqual(["present", "present", "present"]);
    expect(plan.rejected).toEqual([]);
  });

  it("DROPS a student who is not on the roster", () => {
    const plan = planAttendance(roster, [
      { studentId: "s1", status: "late", notes: null },
      { studentId: "someone-elses-student", status: "absent", notes: null },
    ]);

    expect(plan.rejected).toEqual(["someone-elses-student"]);
    expect(plan.upserts.map((mark) => mark.studentId)).toEqual(["s1", "s2", "s3"]);
  });

  it("keeps the last mark when a payload repeats a student", () => {
    const plan = planAttendance(new Set(["s1"]), [
      { studentId: "s1", status: "absent", notes: null },
      { studentId: "s1", status: "excused", notes: "بعذر طبي" },
    ]);

    expect(plan.upserts).toEqual([{ studentId: "s1", status: "excused", notes: "بعذر طبي" }]);
  });

  it("turns blank notes into null rather than storing whitespace", () => {
    const submitted: SubmittedMark[] = [{ studentId: "s1", status: "absent", notes: "   " }];
    expect(planAttendance(new Set(["s1"]), submitted).upserts[0]?.notes).toBeNull();
  });

  it("trims a real note", () => {
    const submitted: SubmittedMark[] = [{ studentId: "s1", status: "late", notes: "  تأخر الأتوبيس  " }];
    expect(planAttendance(new Set(["s1"]), submitted).upserts[0]?.notes).toBe("تأخر الأتوبيس");
  });

  it("writes nothing for an empty roster, even if the payload is full", () => {
    const plan = planAttendance(new Set(), [{ studentId: "s1", status: "absent", notes: null }]);
    expect(plan.upserts).toEqual([]);
    expect(plan.rejected).toEqual(["s1"]);
  });
});

describe("nextStatus", () => {
  it("reaches absent in one tap — the common correction", () => {
    expect(nextStatus("present")).toBe("absent");
  });

  it("cycles back round to present", () => {
    expect(nextStatus("absent")).toBe("late");
    expect(nextStatus("late")).toBe("excused");
    expect(nextStatus("excused")).toBe("present");
  });
});

describe("summarize", () => {
  it("counts each status and the attendance percentage", () => {
    expect(summarize(["present", "present", "absent", "late", "excused"])).toEqual({
      present: 2,
      absent: 1,
      late: 1,
      excused: 1,
      total: 5,
      // Only `absent` counts against attendance; late and excused were there.
      attendedPercent: 80,
    });
  });

  it("is zero, not NaN, for an empty class", () => {
    expect(summarize([]).attendedPercent).toBe(0);
  });

  it("rounds to a whole percent", () => {
    expect(summarize(["present", "present", "absent"]).attendedPercent).toBe(67);
  });
});
