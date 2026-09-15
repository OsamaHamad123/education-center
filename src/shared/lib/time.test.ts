import { describe, expect, it } from "vitest";
import {
  addMinutesToTime,
  eachDayInRange,
  formatDisplayDate,
  isoDayOfWeek,
  minutesToTime,
  nowTimeInCairo,
  timeRangesOverlap,
  timeToMinutes,
  todayInCairo,
} from "./time";

describe("todayInCairo", () => {
  it("returns the Cairo calendar day, not the UTC one", () => {
    // 21:30 UTC on 2 June is already 3 June in Cairo (UTC+3 in summer).
    expect(todayInCairo(new Date("2026-06-02T21:30:00Z"))).toBe("2026-06-03");
    // 01:00 UTC is still the same day in Cairo.
    expect(todayInCairo(new Date("2026-06-02T01:00:00Z"))).toBe("2026-06-02");
  });

  it("handles the winter offset too", () => {
    // In January Cairo is UTC+2, so 22:30 UTC is already the next day.
    expect(todayInCairo(new Date("2026-01-10T22:30:00Z"))).toBe("2026-01-11");
    expect(todayInCairo(new Date("2026-01-10T21:00:00Z"))).toBe("2026-01-10");
  });
});

describe("nowTimeInCairo", () => {
  it("returns Cairo wall-clock time", () => {
    expect(nowTimeInCairo(new Date("2026-06-02T09:15:00Z"))).toBe("12:15");
  });
});

describe("isoDayOfWeek", () => {
  it("uses ISO numbering with Sunday as 7", () => {
    expect(isoDayOfWeek("2026-06-01")).toBe(1); // Monday
    expect(isoDayOfWeek("2026-06-06")).toBe(6); // Saturday — first school day
    expect(isoDayOfWeek("2026-06-07")).toBe(7); // Sunday
  });
});

describe("formatDisplayDate", () => {
  it("formats as dd/MM/yyyy", () => {
    expect(formatDisplayDate("2026-06-03")).toBe("03/06/2026");
  });

  it("rejects a malformed date instead of guessing", () => {
    expect(() => formatDisplayDate("03/06/2026")).toThrow(/Invalid ISO date/);
  });
});

describe("time arithmetic", () => {
  it("converts between HH:mm and minutes since midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(0)).toBe("00:00");
  });

  it("accepts the HH:mm:ss form Postgres returns for a time column", () => {
    expect(timeToMinutes("08:30:00")).toBe(510);
  });

  it("rejects impossible times", () => {
    expect(() => timeToMinutes("25:00")).toThrow(/Invalid time/);
    expect(() => timeToMinutes("08:75")).toThrow(/Invalid time/);
    expect(() => timeToMinutes("8:30")).toThrow(/Invalid time/);
  });

  it("adds minutes across the hour boundary", () => {
    expect(addMinutesToTime("08:45", 45)).toBe("09:30");
    expect(addMinutesToTime("08:00", 0)).toBe("08:00");
  });
});

describe("timeRangesOverlap", () => {
  it("detects a teacher booked twice at the same time", () => {
    expect(timeRangesOverlap("08:00", "08:45", "08:30", "09:15")).toBe(true);
    expect(timeRangesOverlap("08:00", "08:45", "07:30", "08:15")).toBe(true);
    // One range fully inside the other.
    expect(timeRangesOverlap("08:00", "09:00", "08:15", "08:30")).toBe(true);
  });

  it("treats back-to-back periods as free", () => {
    expect(timeRangesOverlap("08:00", "08:45", "08:45", "09:30")).toBe(false);
    expect(timeRangesOverlap("08:00", "08:45", "09:00", "09:45")).toBe(false);
  });
});

describe("eachDayInRange", () => {
  it("is inclusive at both ends", () => {
    expect(eachDayInRange("2026-06-01", "2026-06-04")).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ]);
    expect(eachDayInRange("2026-06-01", "2026-06-01")).toEqual(["2026-06-01"]);
  });

  it("crosses a month boundary", () => {
    expect(eachDayInRange("2026-05-30", "2026-06-02")).toEqual([
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
    ]);
  });

  it("returns nothing when the range is inverted", () => {
    expect(eachDayInRange("2026-06-04", "2026-06-01")).toEqual([]);
  });
});
