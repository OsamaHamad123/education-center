import { describe, expect, it } from "vitest";
import {
  findConflicts,
  firstRedactedConflict,
  redactConflict,
  type ExistingSlot,
  type PlannedSlot,
} from "./conflicts";

const BRANCH_A = "11111111-1111-4111-8111-111111111111";
const BRANCH_B = "22222222-2222-4222-8222-222222222222";

const candidate: PlannedSlot = {
  classId: "class-1",
  teacherId: "teacher-1",
  dayOfWeek: 6,
  periodNumber: 2,
  startTime: "08:45",
  endTime: "09:30",
};

function slot(overrides: Partial<ExistingSlot> = {}): ExistingSlot {
  return {
    id: "slot-existing",
    branchId: BRANCH_A,
    className: "أولى علمي ذكور",
    branchName: "مدينة نصر",
    classId: "class-9",
    teacherId: "teacher-9",
    dayOfWeek: 6,
    periodNumber: 2,
    startTime: "08:45",
    endTime: "09:30",
    ...overrides,
  };
}

describe("findConflicts", () => {
  it("finds nothing in an empty week", () => {
    expect(findConflicts(candidate, [])).toEqual([]);
  });

  it("refuses a second subject in the same class and period", () => {
    const conflicts = findConflicts(candidate, [slot({ classId: "class-1" })]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("class_busy");
  });

  it("refuses a teacher already teaching elsewhere at that moment", () => {
    const conflicts = findConflicts(candidate, [slot({ teacherId: "teacher-1", branchId: BRANCH_B })]);
    expect(conflicts[0]?.kind).toBe("teacher_busy");
  });

  it("catches a PARTIAL overlap, not just an identical period", () => {
    // The other branch starts its day an hour later, so periods do not line up.
    const conflicts = findConflicts(candidate, [
      slot({ teacherId: "teacher-1", branchId: BRANCH_B, startTime: "09:15", endTime: "10:00" }),
    ]);
    expect(conflicts[0]?.kind).toBe("teacher_busy");
  });

  it("allows back-to-back periods — 09:30 does not overlap 09:30", () => {
    const conflicts = findConflicts(candidate, [
      slot({ teacherId: "teacher-1", branchId: BRANCH_B, startTime: "09:30", endTime: "10:15" }),
    ]);
    expect(conflicts).toEqual([]);
  });

  it("allows the same teacher at the same time on a different day", () => {
    expect(findConflicts(candidate, [slot({ teacherId: "teacher-1", dayOfWeek: 7 })])).toEqual([]);
  });

  it("does not let the slot being edited conflict with itself", () => {
    const self = slot({ id: "slot-1", classId: "class-1", teacherId: "teacher-1" });
    expect(findConflicts(candidate, [self], { ignoreSlotId: "slot-1" })).toEqual([]);
  });

  it("reports the class clash first when a cell is wrong in two ways at once", () => {
    const conflicts = findConflicts(candidate, [
      slot({ id: "a", classId: "class-1" }),
      slot({ id: "b", teacherId: "teacher-1", branchId: BRANCH_B }),
    ]);
    expect(conflicts.map((c) => c.kind)).toEqual(["class_busy", "teacher_busy"]);
  });
});

describe("redactConflict", () => {
  const busyElsewhere = findConflicts(candidate, [
    slot({ teacherId: "teacher-1", branchId: BRANCH_B, branchName: "الجيزة", className: "ثانية أدبي إناث" }),
  ])[0];

  it("tells a super admin which branch and class the teacher is in", () => {
    expect(busyElsewhere).toBeDefined();
    if (!busyElsewhere) return;
    expect(redactConflict(busyElsewhere, { role: "super_admin", branchId: BRANCH_A })).toEqual({
      kind: "teacher_busy",
      detail: "other_branch",
      branchName: "الجيزة",
      className: "ثانية أدبي إناث",
    });
  });

  it("tells a branch admin NOTHING about the other branch", () => {
    if (!busyElsewhere) return;
    const redacted = redactConflict(busyElsewhere, { role: "branch_admin", branchId: BRANCH_A });

    expect(redacted).toEqual({ kind: "teacher_busy", detail: "none" });
    // The whole point: no name of any kind survives the redaction.
    expect(JSON.stringify(redacted)).not.toContain("الجيزة");
    expect(JSON.stringify(redacted)).not.toContain("ثانية أدبي إناث");
  });

  it("tells a teacher nothing either", () => {
    if (!busyElsewhere) return;
    expect(redactConflict(busyElsewhere, { role: "teacher", branchId: BRANCH_A })).toEqual({
      kind: "teacher_busy",
      detail: "none",
    });
  });

  it("names the class when the clash is inside the viewer's own branch", () => {
    const sameBranch = findConflicts(candidate, [
      slot({ teacherId: "teacher-1", branchId: BRANCH_A, className: "ثالثة علمي ذكور", periodNumber: 2 }),
    ])[0];
    expect(sameBranch).toBeDefined();
    if (!sameBranch) return;

    expect(redactConflict(sameBranch, { role: "branch_admin", branchId: BRANCH_A })).toEqual({
      kind: "teacher_busy",
      detail: "same_branch",
      className: "ثالثة علمي ذكور",
      periodNumber: 2,
    });
  });

  it("redacts for a super admin in «كافة الفروع» mode by branch, not by role", () => {
    if (!busyElsewhere) return;
    // No branch selected means every branch is "elsewhere"; a super admin may still
    // be told, because overseeing every branch is their whole job.
    expect(redactConflict(busyElsewhere, { role: "super_admin", branchId: null })).toMatchObject({
      detail: "other_branch",
    });
  });

  it("always names a class clash, which is the viewer's own class", () => {
    const own = findConflicts(candidate, [slot({ classId: "class-1", className: "أولى علمي ذكور" })])[0];
    expect(own).toBeDefined();
    if (!own) return;

    expect(redactConflict(own, { role: "branch_admin", branchId: BRANCH_A })).toEqual({
      kind: "class_busy",
      className: "أولى علمي ذكور",
      periodNumber: 2,
    });
  });
});

describe("firstRedactedConflict", () => {
  it("is null when there is nothing wrong", () => {
    expect(firstRedactedConflict([], { role: "branch_admin", branchId: BRANCH_A })).toBeNull();
  });
});
