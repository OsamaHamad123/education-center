import { describe, expect, it } from "vitest";
import { daysAbsent, describePeriodRuns, groupAbsences, type AbsenceRow } from "./absences";

const row = (over: Partial<AbsenceRow> & { studentId: string; sessionId: string }): AbsenceRow => ({
  fullName: "طالب",
  studentCode: "S1",
  classId: "c1",
  className: "أدبي إناث ٢",
  sessionDate: "2026-09-13",
  periodNumber: 1,
  subjectName: "عربي",
  teacherName: "أ. سعدي",
  ...over,
});

describe("groupAbsences", () => {
  it("puts one student on one line, whatever they missed", () => {
    const grouped = groupAbsences([
      row({ studentId: "s1", sessionId: "x1", periodNumber: 1 }),
      row({ studentId: "s1", sessionId: "x2", periodNumber: 2 }),
      row({ studentId: "s1", sessionId: "x3", periodNumber: 3 }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.count).toBe(3);
  });

  it("shows ONE missed period — the threshold screens never would", () => {
    // A boy who missed one lesson out of forty is at 2.5% and invisible to the alerts.
    const grouped = groupAbsences([row({ studentId: "s1", sessionId: "x1", periodNumber: 4 })]);
    expect(grouped[0]?.count).toBe(1);
    expect(grouped[0]?.entries[0]?.periodNumber).toBe(4);
  });

  it("puts the student with the most absences first — it is a worklist", () => {
    const grouped = groupAbsences([
      row({ studentId: "one", fullName: "آية", sessionId: "a1" }),
      row({ studentId: "three", fullName: "براء", sessionId: "b1", periodNumber: 1 }),
      row({ studentId: "three", fullName: "براء", sessionId: "b2", periodNumber: 2 }),
      row({ studentId: "three", fullName: "براء", sessionId: "b3", periodNumber: 3 }),
    ]);
    expect(grouped.map((student) => student.studentId)).toEqual(["three", "one"]);
  });

  it("orders one student's lessons newest day first, then by period", () => {
    const grouped = groupAbsences([
      row({ studentId: "s1", sessionId: "old", sessionDate: "2026-09-10", periodNumber: 2 }),
      row({ studentId: "s1", sessionId: "new2", sessionDate: "2026-09-15", periodNumber: 3 }),
      row({ studentId: "s1", sessionId: "new1", sessionDate: "2026-09-15", periodNumber: 1 }),
    ]);
    expect(grouped[0]?.entries.map((entry) => entry.sessionId)).toEqual(["new1", "new2", "old"]);
  });

  it("returns nothing for a clean register", () => {
    expect(groupAbsences([])).toEqual([]);
  });
});

describe("describePeriodRuns", () => {
  it("names a single period plainly", () => {
    expect(describePeriodRuns([3])).toBe("3");
  });

  it("lists two consecutive periods rather than ranging them", () => {
    expect(describePeriodRuns([2, 3])).toBe("2، 3");
  });

  it("ranges three or more in a row — a boy who went home", () => {
    expect(describePeriodRuns([2, 3, 4])).toBe("2–4");
  });

  it("keeps scattered periods apart — a boy avoiding three subjects", () => {
    expect(describePeriodRuns([1, 3, 5])).toBe("1، 3، 5");
  });

  it("mixes a run and a stray", () => {
    expect(describePeriodRuns([1, 2, 3, 6])).toBe("1–3، 6");
  });

  it("sorts and de-duplicates what it is given", () => {
    expect(describePeriodRuns([5, 1, 5, 2])).toBe("1، 2، 5");
  });

  it("is empty for nothing", () => {
    expect(describePeriodRuns([])).toBe("");
  });
});

describe("daysAbsent", () => {
  it("counts days, not periods", () => {
    const entries = [
      row({ studentId: "s1", sessionId: "a", sessionDate: "2026-09-13", periodNumber: 1 }),
      row({ studentId: "s1", sessionId: "b", sessionDate: "2026-09-13", periodNumber: 2 }),
      row({ studentId: "s1", sessionId: "c", sessionDate: "2026-09-15", periodNumber: 1 }),
    ];
    expect(daysAbsent(entries)).toBe(2);
  });
});
