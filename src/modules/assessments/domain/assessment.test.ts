import { describe, expect, it } from "vitest";
import { checkAssessment, checkPublish, publishState } from "./assessment";

const TODAY = "2026-09-24";

describe("checkAssessment", () => {
  const valid = { name: "امتحان شهر سبتمبر", maxScoreHundredths: 2000, assessedOn: TODAY, today: TODAY };

  it("accepts an ordinary exam", () => {
    expect(checkAssessment(valid)).toBeNull();
  });

  it("requires a name — a row of marks with no title means nothing in a month", () => {
    expect(checkAssessment({ ...valid, name: "   " })).toBe("NAME_REQUIRED");
  });

  it("refuses a total of zero or below", () => {
    expect(checkAssessment({ ...valid, maxScoreHundredths: 0 })).toBe("MAX_SCORE_INVALID");
    expect(checkAssessment({ ...valid, maxScoreHundredths: -100 })).toBe("MAX_SCORE_INVALID");
  });

  it("refuses a total the column will not hold", () => {
    expect(checkAssessment({ ...valid, maxScoreHundredths: 100_001 })).toBe("MAX_SCORE_INVALID");
    expect(checkAssessment({ ...valid, maxScoreHundredths: 100_000 })).toBeNull();
  });

  it("refuses a fractional hundredth, which means the unit was lost on the way in", () => {
    expect(checkAssessment({ ...valid, maxScoreHundredths: 1750.5 })).toBe("MAX_SCORE_INVALID");
  });

  it("refuses an exam dated in the future — it has not been sat", () => {
    expect(checkAssessment({ ...valid, assessedOn: "2026-09-25" })).toBe("FUTURE_DATE");
  });

  it("accepts a back-dated exam inside the year", () => {
    expect(checkAssessment({ ...valid, assessedOn: "2026-03-01" })).toBeNull();
  });

  it("refuses one older than a year", () => {
    expect(checkAssessment({ ...valid, assessedOn: "2025-09-23" })).toBe("TOO_FAR_BACK");
  });
});

describe("publishState", () => {
  it("is a draft until somebody publishes it", () => {
    expect(publishState(null)).toBe("draft");
    expect(publishState(new Date())).toBe("published");
  });
});

describe("checkPublish", () => {
  it("publishes a marked exam", () => {
    expect(checkPublish({ publishedAt: null, scoredCount: 20, publish: true })).toBeNull();
  });

  it("refuses to publish an EMPTY exam", () => {
    // It would tell every family in the class that a result exists and show them
    // nothing, which is worse than saying nothing.
    expect(checkPublish({ publishedAt: null, scoredCount: 0, publish: true })).toBe("NOTHING_TO_PUBLISH");
  });

  it("publishes a PARTLY marked exam", () => {
    // A child absent on results day has no row yet. Holding the class back for them
    // means the exam is never published at all.
    expect(checkPublish({ publishedAt: null, scoredCount: 1, publish: true })).toBeNull();
  });

  it("refuses to publish twice", () => {
    expect(checkPublish({ publishedAt: new Date(), scoredCount: 20, publish: true })).toBe(
      "ALREADY_PUBLISHED",
    );
  });

  it("withdraws a published exam", () => {
    expect(checkPublish({ publishedAt: new Date(), scoredCount: 20, publish: false })).toBeNull();
  });

  it("refuses to withdraw one that was never published", () => {
    expect(checkPublish({ publishedAt: null, scoredCount: 20, publish: false })).toBe("NOT_PUBLISHED");
  });
});
