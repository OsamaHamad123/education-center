import { describe, expect, it } from "vitest";
import { academicYearOf, formatStudentCode, normalizeStudentCode, parseStudentCode } from "./student-code";

describe("formatStudentCode", () => {
  it("pads the year and the sequence", () => {
    expect(formatStudentCode({ branchCode: "OBR", year: 26, sequence: 42 })).toBe("OBR-26-00042");
    expect(formatStudentCode({ branchCode: "NSR", year: 7, sequence: 1 })).toBe("NSR-07-00001");
  });

  it("accepts the full range of branch code lengths", () => {
    expect(formatStudentCode({ branchCode: "GZ", year: 26, sequence: 1 })).toBe("GZ-26-00001");
    expect(formatStudentCode({ branchCode: "ABCDE", year: 26, sequence: 1 })).toBe("ABCDE-26-00001");
  });

  it("refuses inputs that would produce an unparseable code", () => {
    expect(() => formatStudentCode({ branchCode: "obr", year: 26, sequence: 1 })).toThrow();
    expect(() => formatStudentCode({ branchCode: "TOOLONG", year: 26, sequence: 1 })).toThrow();
    expect(() => formatStudentCode({ branchCode: "OBR", year: 100, sequence: 1 })).toThrow();
    expect(() => formatStudentCode({ branchCode: "OBR", year: 26, sequence: 0 })).toThrow();
    expect(() => formatStudentCode({ branchCode: "OBR", year: 26, sequence: 100000 })).toThrow();
  });
});

describe("parseStudentCode", () => {
  it("round-trips with formatStudentCode", () => {
    const parts = { branchCode: "OBR", year: 26, sequence: 42 };
    expect(parseStudentCode(formatStudentCode(parts))).toEqual(parts);
  });

  it("is forgiving about case and surrounding space, as a parent would type it", () => {
    expect(parseStudentCode("  obr-26-00042 ")).toEqual({
      branchCode: "OBR",
      year: 26,
      sequence: 42,
    });
  });

  it("rejects malformed codes", () => {
    for (const bad of ["OBR-26-42", "OBR2600042", "OBR-2026-00042", "", "O-26-00042"]) {
      expect(parseStudentCode(bad), bad).toBeNull();
    }
  });
});

describe("normalizeStudentCode", () => {
  it("strips spaces anywhere and upper-cases", () => {
    expect(normalizeStudentCode(" obr - 26 - 00042 ")).toBe("OBR-26-00042");
  });
});

describe("academicYearOf", () => {
  it("takes the two-digit year from an ISO date", () => {
    expect(academicYearOf("2026-09-01")).toBe(26);
    expect(academicYearOf("2007-01-31")).toBe(7);
  });
});
