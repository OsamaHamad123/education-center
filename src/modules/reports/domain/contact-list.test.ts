import { describe, expect, it } from "vitest";
import { describePeriods, familyTemplateValues, groupByFamily, type AbsenceMark } from "./contact-list";

function mark(overrides: Partial<AbsenceMark> = {}): AbsenceMark {
  return {
    studentId: "s1",
    studentCode: "NSR-26-00001",
    fullName: "محمد أحمد",
    className: "الصف الثالث - أ",
    parentPhone: "+201012345678",
    status: "absent",
    subjectName: "رياضيات",
    periodNumber: 2,
    monthAbsences: 1,
    ...overrides,
  };
}

describe("groupByFamily", () => {
  it("turns three missed periods into ONE row naming three periods", () => {
    // The whole point of P4b. Six absences for one child is six messages unless this
    // function exists.
    const families = groupByFamily([
      mark({ periodNumber: 2, subjectName: "رياضيات" }),
      mark({ periodNumber: 3, subjectName: "فيزياء" }),
      mark({ periodNumber: 4, subjectName: "كيمياء" }),
    ]);

    expect(families).toHaveLength(1);
    expect(families[0]?.children).toHaveLength(1);
    expect(families[0]?.children[0]?.periods).toHaveLength(3);
  });

  it("puts siblings in one row, because a family is a phone number", () => {
    const families = groupByFamily([
      mark({ studentId: "s1", fullName: "محمد أحمد" }),
      mark({ studentId: "s2", fullName: "سارة أحمد", studentCode: "NSR-26-00002" }),
    ]);

    expect(families).toHaveLength(1);
    expect(families[0]?.children.map((child) => child.fullName)).toEqual(["سارة أحمد", "محمد أحمد"]);
  });

  it("keeps different families apart", () => {
    const families = groupByFamily([
      mark({ parentPhone: "+201012345678" }),
      mark({ studentId: "s2", parentPhone: "+201099999999" }),
    ]);
    expect(families).toHaveLength(2);
  });

  it("orders the periods by period number, not by arrival", () => {
    const families = groupByFamily([
      mark({ periodNumber: 5, subjectName: "لغة عربية" }),
      mark({ periodNumber: 1, subjectName: "رياضيات" }),
    ]);
    expect(families[0]?.children[0]?.periods.map((p) => p.periodNumber)).toEqual([1, 5]);
  });

  it("flags a family with a repeat, and puts it first", () => {
    const families = groupByFamily([
      mark({ studentId: "s1", parentPhone: "+201011111111", monthAbsences: 1 }),
      mark({ studentId: "s2", parentPhone: "+201022222222", monthAbsences: 4 }),
    ]);

    // A worklist that is not ordered is a list. The pattern gets rung first.
    expect(families[0]?.parentPhone).toBe("+201022222222");
    expect(families[0]?.repeated).toBe(true);
    expect(families[1]?.repeated).toBe(false);
  });

  it("puts a family with two children out before a family with one", () => {
    const families = groupByFamily([
      mark({ studentId: "s1", parentPhone: "+201011111111" }),
      mark({ studentId: "s2", parentPhone: "+201022222222" }),
      mark({ studentId: "s3", parentPhone: "+201022222222", fullName: "ب" }),
    ]);
    expect(families[0]?.parentPhone).toBe("+201022222222");
  });

  it("returns nothing for a day with nothing to report", () => {
    expect(groupByFamily([])).toEqual([]);
  });
});

describe("describePeriods", () => {
  it("reads the way a parent would say it", () => {
    const [family] = groupByFamily([
      mark({ periodNumber: 2, subjectName: "رياضيات" }),
      mark({ periodNumber: 3, subjectName: "فيزياء" }),
    ]);
    const child = family?.children[0];
    expect(child && describePeriods(child, "الحصة")).toBe("رياضيات (الحصة 2)، فيزياء (الحصة 3)");
  });
});

describe("familyTemplateValues", () => {
  it("names one child plainly", () => {
    const [family] = groupByFamily([mark({ periodNumber: 2, subjectName: "رياضيات" })]);
    expect(family && familyTemplateValues(family, "الحصة")).toEqual({
      الطالب: "محمد أحمد",
      الحصص: "رياضيات (الحصة 2)",
      مرات: "1",
    });
  });

  it("gives two siblings ONE message, with each child's periods labelled", () => {
    const [family] = groupByFamily([
      mark({ studentId: "s1", fullName: "محمد أحمد", subjectName: "رياضيات", periodNumber: 2 }),
      mark({ studentId: "s2", fullName: "سارة أحمد", subjectName: "فيزياء", periodNumber: 3 }),
    ]);
    const values = family && familyTemplateValues(family, "الحصة");

    // One greeting and one signature, not two copies of the whole message.
    expect(values?.الطالب).toBe("سارة أحمد ومحمد أحمد");
    expect(values?.الحصص).toBe("سارة: فيزياء (الحصة 3) — محمد: رياضيات (الحصة 2)");
  });

  it("uses the worst child's count for the repeat wording", () => {
    const [family] = groupByFamily([
      mark({ studentId: "s1", monthAbsences: 1 }),
      mark({ studentId: "s2", fullName: "ب ب", monthAbsences: 5 }),
    ]);
    expect(family && familyTemplateValues(family, "الحصة").مرات).toBe("5");
  });
});
