import { describe, expect, it } from "vitest";
import { formatEGP, piastersToPounds, poundsToPiasters, sumPiasters } from "./money";

describe("poundsToPiasters", () => {
  it("converts pounds entered in a form to integer piasters", () => {
    expect(poundsToPiasters(12.5)).toBe(1250);
    expect(poundsToPiasters(0)).toBe(0);
    expect(poundsToPiasters(1)).toBe(100);
  });

  it("survives float representation noise", () => {
    // 0.1 + 0.2 territory: 8.7 * 100 is 869.9999… in IEEE 754.
    expect(poundsToPiasters(8.7)).toBe(870);
    expect(poundsToPiasters(1.15)).toBe(115);
  });

  it("rejects precision finer than one piaster", () => {
    expect(() => poundsToPiasters(12.345)).toThrow(/precision/);
  });

  it("rejects non-finite input", () => {
    expect(() => poundsToPiasters(Number.NaN)).toThrow();
    expect(() => poundsToPiasters(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("piastersToPounds", () => {
  it("is the inverse of poundsToPiasters", () => {
    for (const pounds of [0, 1, 12.5, 999.99]) {
      expect(piastersToPounds(poundsToPiasters(pounds))).toBe(pounds);
    }
  });

  it("refuses a non-integer piaster amount", () => {
    expect(() => piastersToPounds(12.5)).toThrow(/integer/);
  });
});

describe("formatEGP", () => {
  it("formats with a thousands separator and two decimals", () => {
    expect(formatEGP(125000)).toBe("1,250.00 ج.م");
    expect(formatEGP(0)).toBe("0.00 ج.م");
    expect(formatEGP(50)).toBe("0.50 ج.م");
  });

  it("uses Western digits, as the spec requires", () => {
    expect(formatEGP(125000)).toMatch(/^[\d,.]+ /);
  });
});

describe("sumPiasters", () => {
  it("adds without floating point drift", () => {
    expect(sumPiasters([1015, 1015, 1015])).toBe(3045);
    expect(sumPiasters([])).toBe(0);
  });

  it("refuses a non-integer amount rather than rounding silently", () => {
    expect(() => sumPiasters([100, 12.5])).toThrow(/integer/);
  });
});
