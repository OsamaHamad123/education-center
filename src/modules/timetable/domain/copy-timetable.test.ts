import { describe, expect, it } from "vitest";
import { computePeriods } from "./compute-periods";
import { cellKey, planCopy, type SourceSlot } from "./copy-timetable";

const scientific = computePeriods({
  dayStartTime: "08:00",
  periodDurationMin: 45,
  periodsCount: 4,
  breaks: [],
});

/** The literary track starts an hour later — the reason a copy re-derives times. */
const literary = computePeriods({
  dayStartTime: "09:00",
  periodDurationMin: 45,
  periodsCount: 2,
  breaks: [],
});

const source: SourceSlot[] = [
  { subjectId: "sub-math", subjectName: "الرياضيات", teacherId: "t1", dayOfWeek: 6, periodNumber: 1 },
  { subjectId: "sub-phys", subjectName: "الفيزياء", teacherId: "t2", dayOfWeek: 6, periodNumber: 3 },
  { subjectId: "sub-chem", subjectName: "الكيمياء", teacherId: "t1", dayOfWeek: 5, periodNumber: 1 },
];

const everyTeacher = new Set(["t1", "t2"]);

describe("planCopy", () => {
  it("copies a week onto an identical schedule unchanged", () => {
    const plan = planCopy({
      source: [source[0] as SourceSlot],
      targetClassId: "class-2",
      targetPeriods: scientific,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: everyTeacher,
    });

    expect(plan.skipped).toEqual([]);
    expect(plan.create).toEqual([
      {
        classId: "class-2",
        teacherId: "t1",
        subjectId: "sub-math",
        subjectName: "الرياضيات",
        dayOfWeek: 6,
        periodNumber: 1,
        startTime: "08:00",
        endTime: "08:45",
      },
    ]);
  });

  it("re-derives times from the TARGET schedule, not the source's", () => {
    const plan = planCopy({
      source: [source[0] as SourceSlot],
      targetClassId: "class-2",
      targetPeriods: literary,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: everyTeacher,
    });

    expect(plan.create[0]?.startTime).toBe("09:00");
  });

  it("skips a period the target's shorter day does not have", () => {
    const plan = planCopy({
      source,
      targetClassId: "class-2",
      targetPeriods: literary,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: everyTeacher,
    });

    expect(plan.create.map((c) => c.subjectName)).toEqual(["الرياضيات"]);
    expect(plan.skipped).toContainEqual({
      subjectName: "الفيزياء",
      dayOfWeek: 6,
      periodNumber: 3,
      reason: "period_missing",
    });
  });

  it("skips a day the target branch does not work", () => {
    const plan = planCopy({
      source,
      targetClassId: "class-2",
      targetPeriods: scientific,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: everyTeacher,
    });

    // Friday is the weekend, so الكيمياء has nowhere to land.
    expect(plan.skipped).toContainEqual({
      subjectName: "الكيمياء",
      dayOfWeek: 5,
      periodNumber: 1,
      reason: "day_not_working",
    });
  });

  it("never overwrites a cell that already has something in it", () => {
    const plan = planCopy({
      source: [source[0] as SourceSlot],
      targetClassId: "class-2",
      targetPeriods: scientific,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set([cellKey(6, 1)]),
      teachersInBranch: everyTeacher,
    });

    expect(plan.create).toEqual([]);
    expect(plan.skipped[0]?.reason).toBe("cell_occupied");
  });

  it("refuses to bring a teacher who does not work in the target branch", () => {
    const plan = planCopy({
      source: [source[0] as SourceSlot],
      targetClassId: "class-2",
      targetPeriods: scientific,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: new Set(["t2"]),
    });

    expect(plan.create).toEqual([]);
    expect(plan.skipped[0]?.reason).toBe("teacher_not_in_branch");
  });

  it("lets the first of two source slots claim a cell, and reports the second", () => {
    const clashing: SourceSlot[] = [
      { subjectId: "a", subjectName: "الأولى", teacherId: "t1", dayOfWeek: 6, periodNumber: 1 },
      { subjectId: "b", subjectName: "الثانية", teacherId: "t2", dayOfWeek: 6, periodNumber: 1 },
    ];

    const plan = planCopy({
      source: clashing,
      targetClassId: "class-2",
      targetPeriods: scientific,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: everyTeacher,
    });

    expect(plan.create.map((c) => c.subjectName)).toEqual(["الأولى"]);
    expect(plan.skipped[0]).toMatchObject({ subjectName: "الثانية", reason: "cell_occupied" });
  });

  it("copies an empty week without complaint", () => {
    const plan = planCopy({
      source: [],
      targetClassId: "class-2",
      targetPeriods: scientific,
      targetWorkingDays: [6, 7, 1, 2, 3, 4],
      occupied: new Set(),
      teachersInBranch: everyTeacher,
    });

    expect(plan).toEqual({ create: [], skipped: [] });
  });
});
