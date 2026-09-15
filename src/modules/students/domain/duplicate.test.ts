import { describe, expect, it } from "vitest";
import { findLikelyDuplicates, normalizeArabicName, type ExistingStudent } from "./duplicate";

const existing: ExistingStudent[] = [
  {
    id: "s1",
    studentCode: "NSR-26-00001",
    fullName: "محمد أحمد إبراهيم السيد",
    parentPhone: "+201012345678",
    className: "علمي 1",
  },
  {
    id: "s2",
    studentCode: "NSR-26-00002",
    fullName: "مريم أحمد إبراهيم السيد",
    parentPhone: "+201012345678",
    className: "علمي 2",
  },
];

describe("normalizeArabicName", () => {
  it("collapses spacing", () => {
    expect(normalizeArabicName("  محمد   أحمد ")).toBe("محمد احمد");
  });

  it("folds the alef and ya and ta-marbuta variants that people type differently", () => {
    expect(normalizeArabicName("أحمد")).toBe(normalizeArabicName("احمد"));
    expect(normalizeArabicName("إبراهيم")).toBe(normalizeArabicName("ابراهيم"));
    expect(normalizeArabicName("يحيى")).toBe(normalizeArabicName("يحيي"));
    expect(normalizeArabicName("فاطمة")).toBe(normalizeArabicName("فاطمه"));
  });

  it("ignores harakat", () => {
    expect(normalizeArabicName("مُحَمَّد")).toBe(normalizeArabicName("محمد"));
  });
});

describe("findLikelyDuplicates", () => {
  it("matches the same name and the same parent phone", () => {
    const hits = findLikelyDuplicates(
      { fullName: "محمد احمد ابراهيم السيد", parentPhone: "+201012345678" },
      existing,
    );
    expect(hits.map((h) => h.studentCode)).toEqual(["NSR-26-00001"]);
  });

  it("does NOT flag a sibling — same phone, different name", () => {
    const hits = findLikelyDuplicates(
      { fullName: "خالد أحمد إبراهيم السيد", parentPhone: "+201012345678" },
      existing,
    );
    expect(hits).toEqual([]);
  });

  it("does not flag a namesake with a different parent", () => {
    const hits = findLikelyDuplicates(
      { fullName: "محمد أحمد إبراهيم السيد", parentPhone: "+201099999999" },
      existing,
    );
    expect(hits).toEqual([]);
  });
});
