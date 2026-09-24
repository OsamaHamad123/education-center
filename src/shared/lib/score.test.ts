import { describe, expect, it } from "vitest";
import { formatOutOf, formatScore, normalizeDigits, parseScore, scorePercent } from "./score";

describe("parseScore", () => {
  it("reads a whole mark", () => {
    expect(parseScore("20")).toBe(2000);
  });

  it("reads a half mark, which is what teachers actually write", () => {
    expect(parseScore("17.5")).toBe(1750);
  });

  it("reads two decimal places", () => {
    expect(parseScore("17.25")).toBe(1725);
  });

  it("reads Arabic-Indic digits and the Arabic decimal separator", () => {
    // A phone keyboard set to Arabic produces these, and refusing them refuses the
    // keyboard half this country types on.
    expect(parseScore("١٧٫٥")).toBe(1750);
    expect(parseScore("٢٠")).toBe(2000);
  });

  it("returns null for a half-typed value rather than throwing", () => {
    // This runs on every keystroke of a form. "1." is a person still typing.
    expect(parseScore("1.")).toBeNull();
    expect(parseScore("")).toBeNull();
    expect(parseScore("   ")).toBeNull();
  });

  it("refuses anything that is not a number", () => {
    expect(parseScore("abc")).toBeNull();
    expect(parseScore("-5")).toBeNull();
    expect(parseScore("1e3")).toBeNull();
  });

  it("refuses more precision than a hundredth", () => {
    expect(parseScore("17.555")).toBeNull();
  });

  it("refuses a mark above what the column will hold", () => {
    expect(parseScore("1001")).toBeNull();
    expect(parseScore("1000")).toBe(100_000);
  });
});

describe("formatScore", () => {
  it("drops the decimals on a whole mark — a paper says 20, not 20.00", () => {
    expect(formatScore(2000)).toBe("20");
  });

  it("shows one decimal for a half mark", () => {
    expect(formatScore(1750)).toBe("17.5");
  });

  it("shows two when there are two", () => {
    expect(formatScore(1725)).toBe("17.25");
  });

  it("handles zero", () => {
    expect(formatScore(0)).toBe("0");
  });

  it("refuses a non-integer, which would mean the unit was lost somewhere", () => {
    expect(() => formatScore(17.5)).toThrow(/integer in hundredths/);
  });
});

describe("scorePercent", () => {
  it("is the mark over the total", () => {
    expect(scorePercent(1750, 2000)).toBe(88);
    expect(scorePercent(2000, 2000)).toBe(100);
    expect(scorePercent(0, 2000)).toBe(0);
  });

  it("is zero out of nothing rather than an error", () => {
    expect(scorePercent(0, 0)).toBe(0);
  });
});

describe("formatOutOf", () => {
  it("writes the pair the way it is written on a paper", () => {
    expect(formatOutOf(1750, 2000)).toBe("17.5 / 20");
  });
});

describe("normalizeDigits", () => {
  it("converts Arabic-Indic digits", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  it("converts extended Arabic-Indic digits", () => {
    expect(normalizeDigits("۵۱")).toBe("51");
  });

  it("leaves Western digits and other text alone", () => {
    expect(normalizeDigits("17.5")).toBe("17.5");
  });
});
