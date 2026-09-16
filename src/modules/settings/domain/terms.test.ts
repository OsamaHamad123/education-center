import { describe, expect, it } from "vitest";
import { checkTerm, defaultTerm, termOn, termRangeFor, type Term } from "./terms";

const first: Term = {
  id: "t1",
  name: "الفصل الدراسي الأول",
  startDate: "2026-09-01",
  endDate: "2027-01-15",
};
const second: Term = {
  id: "t2",
  name: "الفصل الدراسي الثاني",
  startDate: "2027-02-01",
  endDate: "2027-06-10",
};
const terms = [first, second];

describe("termOn", () => {
  it("finds the term a date falls in", () => {
    expect(termOn(terms, "2026-10-05")?.id).toBe("t1");
    expect(termOn(terms, "2027-03-01")?.id).toBe("t2");
  });

  it("includes both ends", () => {
    // A centre that says the term ends on the 15th means the 15th is a school day.
    expect(termOn(terms, "2026-09-01")?.id).toBe("t1");
    expect(termOn(terms, "2027-01-15")?.id).toBe("t1");
  });

  it("returns nothing for the gap between terms", () => {
    expect(termOn(terms, "2027-01-20")).toBeNull();
  });

  it("returns nothing when the calendar is empty", () => {
    expect(termOn([], "2026-10-05")).toBeNull();
  });
});

describe("termRangeFor", () => {
  it("is the term's own dates when today is in one", () => {
    expect(termRangeFor(terms, "2026-10-05")).toEqual({ from: "2026-09-01", to: "2027-01-15" });
  });

  it("falls back to the last twelve months in the summer", () => {
    // What the lookup did before terms existed, so a centre with no calendar sees
    // exactly what it saw and one with a calendar gets the truth.
    expect(termRangeFor(terms, "2027-07-01")).toEqual({ from: "2026-07-01", to: "2027-07-01" });
  });

  it("falls back the same way when no terms exist at all", () => {
    expect(termRangeFor([], "2026-09-17")).toEqual({ from: "2025-09-17", to: "2026-09-17" });
  });
});

describe("defaultTerm", () => {
  it("offers today's term", () => {
    expect(defaultTerm(terms, "2026-10-05")?.id).toBe("t1");
  });

  it("offers the most recent one that has begun, in a gap", () => {
    expect(defaultTerm(terms, "2027-01-25")?.id).toBe("t1");
  });

  it("offers nothing before the calendar starts", () => {
    expect(defaultTerm(terms, "2026-01-01")).toBeNull();
  });
});

describe("checkTerm", () => {
  it("accepts a term in a gap", () => {
    expect(checkTerm({ startDate: "2027-01-16", endDate: "2027-01-31" }, terms)).toBeNull();
  });

  it("refuses a backwards range", () => {
    expect(checkTerm({ startDate: "2027-02-01", endDate: "2027-01-01" }, terms)).toBe("BACKWARDS");
  });

  it("refuses an overlap", () => {
    // "The current term" has to have exactly one answer, and a calendar that can give
    // two is a calendar that will.
    expect(checkTerm({ startDate: "2026-12-01", endDate: "2027-03-01" }, terms)).toBe("OVERLAPS");
  });

  it("refuses a term that merely touches another's last day", () => {
    expect(checkTerm({ startDate: "2027-01-15", endDate: "2027-01-31" }, terms)).toBe("OVERLAPS");
  });

  it("lets a term be edited without clashing with itself", () => {
    expect(checkTerm({ id: "t1", startDate: "2026-09-01", endDate: "2027-01-20" }, terms)).toBeNull();
  });

  it("accepts a single day", () => {
    expect(checkTerm({ startDate: "2027-01-20", endDate: "2027-01-20" }, terms)).toBeNull();
  });
});
