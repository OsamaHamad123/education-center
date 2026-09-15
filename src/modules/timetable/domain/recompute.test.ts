import { describe, expect, it } from "vitest";
import { computePeriods } from "./compute-periods";
import { isEmptyPlan, movedSlotsAsCandidates, planRecompute, type SlotToRecompute } from "./recompute";

const WORKING_DAYS = [6, 7, 1, 2, 3, 4];

function slot(overrides: Partial<SlotToRecompute> = {}): SlotToRecompute {
  return {
    id: "slot-1",
    classId: "class-1",
    className: "أولى علمي ذكور",
    teacherId: "teacher-1",
    dayOfWeek: 6,
    periodNumber: 1,
    startTime: "08:00",
    endTime: "08:45",
    ...overrides,
  };
}

const periodsFrom8 = computePeriods({
  dayStartTime: "08:00",
  periodDurationMin: 45,
  periodsCount: 4,
  breaks: [],
});

describe("planRecompute", () => {
  it("does nothing when the schedule still produces the same times", () => {
    const plan = planRecompute([slot()], periodsFrom8, WORKING_DAYS);

    expect(isEmptyPlan(plan)).toBe(true);
    expect(plan.unchangedCount).toBe(1);
  });

  it("moves every slot when the first bell moves", () => {
    const later = computePeriods({
      dayStartTime: "09:00",
      periodDurationMin: 45,
      periodsCount: 4,
      breaks: [],
    });

    const plan = planRecompute([slot(), slot({ id: "slot-2", periodNumber: 2 })], later, WORKING_DAYS);

    expect(plan.retime).toEqual([
      { id: "slot-1", startTime: "09:00", endTime: "09:45" },
      { id: "slot-2", startTime: "09:45", endTime: "10:30" },
    ]);
    expect(plan.deactivate).toEqual([]);
  });

  it("moves only the periods after a newly inserted break", () => {
    const withBreak = computePeriods({
      dayStartTime: "08:00",
      periodDurationMin: 45,
      periodsCount: 4,
      breaks: [{ afterPeriod: 2, durationMin: 15, label: "الفسحة" }],
    });

    const plan = planRecompute(
      [
        slot({ id: "p1", periodNumber: 1 }),
        slot({ id: "p3", periodNumber: 3, startTime: "09:30", endTime: "10:15" }),
      ],
      withBreak,
      WORKING_DAYS,
    );

    expect(plan.unchangedCount).toBe(1);
    expect(plan.retime).toEqual([{ id: "p3", startTime: "09:45", endTime: "10:30" }]);
  });

  it("deactivates a slot whose period no longer exists", () => {
    const shorter = computePeriods({
      dayStartTime: "08:00",
      periodDurationMin: 45,
      periodsCount: 2,
      breaks: [],
    });

    const plan = planRecompute([slot({ id: "p4", periodNumber: 4 })], shorter, WORKING_DAYS);

    expect(plan.retime).toEqual([]);
    expect(plan.deactivate).toEqual([
      { id: "p4", className: "أولى علمي ذكور", dayOfWeek: 6, periodNumber: 4, reason: "period_removed" },
    ]);
  });

  it("deactivates a slot on a day the branch no longer works", () => {
    const plan = planRecompute([slot({ dayOfWeek: 7 })], periodsFrom8, [6, 1, 2, 3, 4]);

    expect(plan.deactivate[0]?.reason).toBe("day_removed");
  });

  it("checks the day before the period, so a dropped day is never blamed on a period", () => {
    const shorter = computePeriods({
      dayStartTime: "08:00",
      periodDurationMin: 45,
      periodsCount: 1,
      breaks: [],
    });

    const plan = planRecompute([slot({ dayOfWeek: 7, periodNumber: 4 })], shorter, [6, 1, 2, 3, 4]);
    expect(plan.deactivate[0]?.reason).toBe("day_removed");
  });
});

describe("movedSlotsAsCandidates", () => {
  it("returns the moved slots carrying their NEW times, ready to re-check", () => {
    const later = computePeriods({
      dayStartTime: "09:00",
      periodDurationMin: 45,
      periodsCount: 4,
      breaks: [],
    });
    const slots = [slot()];
    const plan = planRecompute(slots, later, WORKING_DAYS);

    expect(movedSlotsAsCandidates(plan, slots)).toEqual([
      { ...slot(), startTime: "09:00", endTime: "09:45" },
    ]);
  });

  it("returns nothing when nothing moved", () => {
    const slots = [slot()];
    expect(movedSlotsAsCandidates(planRecompute(slots, periodsFrom8, WORKING_DAYS), slots)).toEqual([]);
  });
});
