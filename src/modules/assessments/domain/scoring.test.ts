import { describe, expect, it } from "vitest";
import { checkScore, planScores, summarizeScores, type SubmittedScore } from "./scoring";

const MAX = 2000;

const mark = (studentId: string, score: number | null, didNotSit = false): SubmittedScore => ({
  studentId,
  scoreHundredths: score,
  didNotSit,
  notes: null,
});

describe("checkScore", () => {
  it("accepts a mark inside the total", () => {
    expect(checkScore({ scoreHundredths: 1750, didNotSit: false, maxScoreHundredths: MAX })).toBeNull();
  });

  it("accepts full marks and zero", () => {
    expect(checkScore({ scoreHundredths: 2000, didNotSit: false, maxScoreHundredths: MAX })).toBeNull();
    expect(checkScore({ scoreHundredths: 0, didNotSit: false, maxScoreHundredths: MAX })).toBeNull();
  });

  it("refuses 25 out of 20", () => {
    expect(checkScore({ scoreHundredths: 2500, didNotSit: false, maxScoreHundredths: MAX })).toBe(
      "OUT_OF_RANGE",
    );
  });

  it("refuses a negative mark", () => {
    expect(checkScore({ scoreHundredths: -100, didNotSit: false, maxScoreHundredths: MAX })).toBe(
      "OUT_OF_RANGE",
    );
  });

  it("accepts an absence with no mark", () => {
    expect(checkScore({ scoreHundredths: null, didNotSit: true, maxScoreHundredths: MAX })).toBeNull();
  });

  it("refuses an absence that also carries a mark", () => {
    expect(checkScore({ scoreHundredths: 1750, didNotSit: true, maxScoreHundredths: MAX })).toBe(
      "ABSENT_WITH_SCORE",
    );
  });

  it("refuses neither a mark nor an absence", () => {
    expect(checkScore({ scoreHundredths: null, didNotSit: false, maxScoreHundredths: MAX })).toBe("NEITHER");
  });
});

describe("planScores", () => {
  const roster = new Set(["s1", "s2", "s3"]);

  it("writes the marks that were sent", () => {
    const plan = planScores(roster, [mark("s1", 1750), mark("s2", 1200)], MAX);
    expect(plan.upserts.map((row) => row.studentId)).toEqual(["s1", "s2"]);
    expect(plan.violation).toBeNull();
  });

  it("leaves an unmarked student UNMARKED — an exam has no default", () => {
    // Attendance defaults everybody to present. An unmarked exam means nothing at
    // all, and inventing a zero would be inventing a result.
    const plan = planScores(roster, [mark("s1", 1750)], MAX);
    expect(plan.skipped).toEqual(["s2", "s3"]);
    expect(plan.upserts).toHaveLength(1);
  });

  it("DROPS a student who is not on the roster", () => {
    // The row would carry its branch from the assessment, so RLS alone would accept
    // a mark attached to a child in another branch.
    const plan = planScores(roster, [mark("s1", 1750), mark("intruder", 2000)], MAX);
    expect(plan.rejected).toEqual(["intruder"]);
    expect(plan.upserts.map((row) => row.studentId)).toEqual(["s1"]);
  });

  it("reports the FIRST bad mark, not a list of twelve", () => {
    const plan = planScores(roster, [mark("s1", 1750), mark("s2", 9999), mark("s3", 8888)], MAX);
    expect(plan.violation).toEqual({ studentId: "s2", reason: "OUT_OF_RANGE" });
  });

  it("keeps the last value when a payload repeats a student", () => {
    const plan = planScores(roster, [mark("s1", 1000), mark("s1", 1750)], MAX);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]?.scoreHundredths).toBe(1750);
  });

  it("trims a note to nothing rather than storing whitespace", () => {
    const plan = planScores(roster, [{ ...mark("s1", 1750), notes: "   " }], MAX);
    expect(plan.upserts[0]?.notes).toBeNull();
  });

  it("returns the roster order, not the payload order", () => {
    const plan = planScores(roster, [mark("s3", 1000), mark("s1", 1750)], MAX);
    expect(plan.upserts.map((row) => row.studentId)).toEqual(["s1", "s3"]);
  });
});

describe("summarizeScores", () => {
  const row = (score: number | null, didNotSit = false) => ({
    scoreHundredths: score,
    didNotSit,
    maxScoreHundredths: MAX,
  });

  it("averages only those who SAT it", () => {
    // Counting an absence as zero would drag a class average down for a reason that
    // has nothing to do with how they did.
    const summary = summarizeScores([row(2000), row(1000), row(null, true)], 5);
    expect(summary.sat).toBe(2);
    expect(summary.didNotSit).toBe(1);
    expect(summary.averagePercent).toBe(75);
  });

  it("reports the spread, which is how a typo is spotted", () => {
    const summary = summarizeScores([row(2000), row(80), row(1800)], 3);
    expect(summary.highestPercent).toBe(100);
    expect(summary.lowestPercent).toBe(4);
  });

  it("counts how much of the roster is still unmarked", () => {
    const summary = summarizeScores([row(2000)], 30);
    expect(summary.marked).toBe(1);
    expect(summary.total).toBe(30);
  });

  it("has no average when nobody sat it", () => {
    const summary = summarizeScores([row(null, true)], 1);
    expect(summary.averagePercent).toBeNull();
    expect(summary.highestPercent).toBeNull();
  });

  it("is empty for an unmarked exam", () => {
    const summary = summarizeScores([], 20);
    expect(summary).toEqual({
      marked: 0,
      total: 20,
      sat: 0,
      didNotSit: 0,
      averagePercent: null,
      highestPercent: null,
      lowestPercent: null,
    });
  });
});
