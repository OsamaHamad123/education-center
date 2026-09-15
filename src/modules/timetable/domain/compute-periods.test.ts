import { describe, expect, it } from "vitest";
import {
  computePeriods,
  dayEndTime,
  isWorkingDay,
  validateBellSchedule,
  type BellSchedule,
} from "./compute-periods";

const base: BellSchedule = {
  dayStartTime: "08:00",
  periodDurationMin: 45,
  periodsCount: 6,
  breaks: [],
};

describe("computePeriods", () => {
  it("lays periods back to back when there are no breaks", () => {
    expect(computePeriods({ ...base, periodsCount: 3 })).toEqual([
      { periodNumber: 1, startTime: "08:00", endTime: "08:45", breakAfter: null },
      { periodNumber: 2, startTime: "08:45", endTime: "09:30", breakAfter: null },
      { periodNumber: 3, startTime: "09:30", endTime: "10:15", breakAfter: null },
    ]);
  });

  it("pushes every later period back by the break", () => {
    const periods = computePeriods({
      ...base,
      periodsCount: 4,
      breaks: [{ afterPeriod: 2, durationMin: 20, label: "الفسحة" }],
    });

    expect(periods.map((p) => p.startTime)).toEqual(["08:00", "08:45", "09:50", "10:35"]);
    expect(periods[1]?.breakAfter?.label).toBe("الفسحة");
    expect(periods[0]?.breakAfter).toBeNull();
  });

  it("accumulates several breaks", () => {
    const periods = computePeriods({
      ...base,
      periodsCount: 5,
      breaks: [
        { afterPeriod: 1, durationMin: 10, label: null },
        { afterPeriod: 3, durationMin: 30, label: null },
      ],
    });

    expect(periods.map((p) => p.startTime)).toEqual(["08:00", "08:55", "09:40", "10:55", "11:40"]);
  });

  it("ignores a break that falls after the last period", () => {
    const withTrailing = computePeriods({
      ...base,
      periodsCount: 2,
      breaks: [{ afterPeriod: 2, durationMin: 20, label: null }],
    });

    expect(withTrailing.map((p) => p.endTime)).toEqual(["08:45", "09:30"]);
  });

  it("returns nothing for a schedule with no periods", () => {
    expect(computePeriods({ ...base, periodsCount: 0 })).toEqual([]);
  });

  it("keeps a late start inside the same day", () => {
    const periods = computePeriods({ ...base, dayStartTime: "18:30", periodsCount: 2 });
    expect(periods.map((p) => p.endTime)).toEqual(["19:15", "20:00"]);
  });
});

describe("dayEndTime", () => {
  it("is the end of the last period", () => {
    expect(dayEndTime({ ...base, periodsCount: 6 })).toBe("12:30");
  });

  it("falls back to the start when nothing is scheduled", () => {
    expect(dayEndTime({ ...base, periodsCount: 0 })).toBe("08:00");
  });
});

describe("validateBellSchedule", () => {
  const withDays = (schedule: Partial<BellSchedule> & { workingDays?: number[] } = {}) => ({
    ...base,
    workingDays: [6, 7, 1, 2, 3, 4],
    ...schedule,
  });

  it("accepts the seeded schedule", () => {
    expect(
      validateBellSchedule(withDays({ breaks: [{ afterPeriod: 3, durationMin: 20, label: "الفسحة" }] })),
    ).toBeNull();
  });

  it("refuses a week with no working days", () => {
    expect(validateBellSchedule(withDays({ workingDays: [] }))).toBe("NO_WORKING_DAYS");
  });

  it("refuses two breaks in the same place", () => {
    expect(
      validateBellSchedule(
        withDays({
          breaks: [
            { afterPeriod: 2, durationMin: 10, label: null },
            { afterPeriod: 2, durationMin: 15, label: null },
          ],
        }),
      ),
    ).toBe("DUPLICATE_BREAK");
  });

  it("refuses a break that would change nothing", () => {
    expect(
      validateBellSchedule(
        withDays({ periodsCount: 3, breaks: [{ afterPeriod: 3, durationMin: 20, label: null }] }),
      ),
    ).toBe("BREAK_AFTER_LAST_PERIOD");
  });

  it("refuses a day that would run past midnight", () => {
    expect(
      validateBellSchedule(withDays({ dayStartTime: "22:00", periodDurationMin: 60, periodsCount: 3 })),
    ).toBe("DAY_OVERFLOWS_MIDNIGHT");
  });

  it("refuses a day that ends exactly at midnight, because 24:00 wraps to 00:00", () => {
    expect(
      validateBellSchedule(withDays({ dayStartTime: "21:00", periodDurationMin: 60, periodsCount: 3 })),
    ).toBe("DAY_OVERFLOWS_MIDNIGHT");
  });

  it("allows the last minute before midnight", () => {
    expect(
      validateBellSchedule(withDays({ dayStartTime: "20:59", periodDurationMin: 60, periodsCount: 3 })),
    ).toBeNull();
  });
});

describe("isWorkingDay", () => {
  it("knows Friday is the weekend by default", () => {
    expect(isWorkingDay([6, 7, 1, 2, 3, 4], 5)).toBe(false);
    expect(isWorkingDay([6, 7, 1, 2, 3, 4], 6)).toBe(true);
  });
});
