import { describe, expect, it } from "vitest";
import {
  formatMaskedName,
  normalizeLastFour,
  normalizeStudentCode,
  validateCredentials,
} from "./credentials";

describe("normalizeStudentCode", () => {
  it("upper-cases and trims what was read off a printed timetable", () => {
    expect(normalizeStudentCode("  nsr-26-00001 ")).toBe("NSR-26-00001");
  });

  it("accepts Arabic-Indic digits, which an Arabic keyboard produces by default", () => {
    expect(normalizeStudentCode("NSR-٢٦-٠٠٠٠١")).toBe("NSR-26-00001");
  });

  it("accepts Persian digits too — the same keyboards produce both", () => {
    expect(normalizeStudentCode("NSR-۲۶-۰۰۰۰۱")).toBe("NSR-26-00001");
  });

  it("removes spaces typed inside the code", () => {
    expect(normalizeStudentCode("NSR - 26 - 00001")).toBe("NSR-26-00001");
  });
});

describe("normalizeLastFour", () => {
  it("keeps only digits", () => {
    expect(normalizeLastFour(" 8 0 0 1 ")).toBe("8001");
  });

  it("converts Arabic-Indic digits", () => {
    expect(normalizeLastFour("٨٠٠١")).toBe("8001");
  });
});

describe("validateCredentials", () => {
  const valid = { code: "NSR-26-00001", lastFour: "8001" };

  it("accepts a well-formed pair", () => {
    expect(validateCredentials(valid)).toBeNull();
  });

  it("refuses an empty code", () => {
    expect(validateCredentials({ ...valid, code: "" })).toBe("CODE_REQUIRED");
  });

  it("refuses a code of the wrong shape", () => {
    for (const code of ["NSR26-00001", "N-26-00001", "NSR-2026-00001", "NSR-26-001", "'; drop table"]) {
      expect(validateCredentials({ ...valid, code })).toBe("CODE_MALFORMED");
    }
  });

  it("refuses anything but exactly four digits", () => {
    for (const lastFour of ["", "800", "80011", "80a1"]) {
      expect(validateCredentials({ ...valid, lastFour })).toBe("DIGITS_REQUIRED");
    }
  });

  it("checks the CODE before the digits, so a malformed request costs one message", () => {
    expect(validateCredentials({ code: "nonsense", lastFour: "" })).toBe("CODE_MALFORMED");
  });

  it("accepts a five-letter branch code and a six-digit sequence", () => {
    // Branch codes grow as branches are added; the shape must not pin today's list.
    expect(validateCredentials({ code: "ABCDE-26-000001", lastFour: "1234" })).toBeNull();
  });
});

describe("formatMaskedName", () => {
  it("is the first name and the family initial, and nothing else", () => {
    expect(formatMaskedName("محمد", "ا")).toBe("محمد ا.");
  });

  it("takes only the first character if a whole family name is passed", () => {
    // Defence in depth: the SQL already sends one letter, but if it ever sent more,
    // this must not become the leak.
    expect(formatMaskedName("محمد", "الفقي")).toBe("محمد ا.");
  });

  it("falls back to the first name alone when there is no family name", () => {
    expect(formatMaskedName("محمد", "")).toBe("محمد");
  });

  it("trims stray whitespace from either part", () => {
    expect(formatMaskedName("  محمد  ", "  ا  ")).toBe("محمد ا.");
  });
});
