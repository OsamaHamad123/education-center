import { describe, expect, it } from "vitest";
import {
  planArchive,
  planBranchTransfer,
  planClassChange,
  planInitialEnrollment,
  planRestore,
  type StudentState,
} from "./enrollment";

const BRANCH_A = "branch-a";
const BRANCH_B = "branch-b";
const CLASS_1 = "class-1";
const CLASS_2 = "class-2";
const CLASS_B = "class-b";

function activeStudent(overrides: Partial<StudentState> = {}): StudentState {
  return {
    status: "active",
    branchId: BRANCH_A,
    classId: CLASS_1,
    current: { id: "enr-1", branchId: BRANCH_A, classId: CLASS_1, startDate: "2026-09-01" },
    ...overrides,
  };
}

describe("planInitialEnrollment", () => {
  it("opens one enrollment starting on the join date", () => {
    const plan = planInitialEnrollment({
      branchId: BRANCH_A,
      classId: CLASS_1,
      joinDate: "2026-09-01",
    });

    expect(plan.close).toBeNull();
    expect(plan.open).toEqual({ branchId: BRANCH_A, classId: CLASS_1, startDate: "2026-09-01" });
    expect(plan.student.status).toBe("active");
  });
});

describe("planClassChange", () => {
  it("closes the open enrollment and opens one in the new class", () => {
    const result = planClassChange(activeStudent(), {
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2026-10-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.close).toEqual({
      enrollmentId: "enr-1",
      endDate: "2026-10-01",
      endReason: "class_change",
    });
    expect(result.plan.open).toEqual({
      branchId: BRANCH_A,
      classId: CLASS_2,
      startDate: "2026-10-01",
    });
    // The branch does not move, so it is not rewritten.
    expect(result.plan.student).toEqual({ classId: CLASS_2 });
  });

  it("refuses a class that belongs to another branch", () => {
    const result = planClassChange(activeStudent(), {
      classId: CLASS_B,
      classBranchId: BRANCH_B,
      onDate: "2026-10-01",
    });
    expect(result).toEqual({ ok: false, error: "CLASS_NOT_IN_BRANCH" });
  });

  it("refuses a move to the class the student is already in", () => {
    const result = planClassChange(activeStudent(), {
      classId: CLASS_1,
      classBranchId: BRANCH_A,
      onDate: "2026-10-01",
    });
    expect(result).toEqual({ ok: false, error: "SAME_CLASS" });
  });

  it("refuses to end an enrollment before it started", () => {
    const result = planClassChange(activeStudent(), {
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2026-08-01",
    });
    expect(result).toEqual({ ok: false, error: "DATE_BEFORE_START" });
  });

  it("refuses to move an archived student", () => {
    const result = planClassChange(activeStudent({ status: "archived" }), {
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2026-10-01",
    });
    expect(result).toEqual({ ok: false, error: "STUDENT_ARCHIVED" });
  });
});

describe("planBranchTransfer", () => {
  it("closes with branch_transfer and moves both branch and class", () => {
    const result = planBranchTransfer(activeStudent(), {
      branchId: BRANCH_B,
      classId: CLASS_B,
      classBranchId: BRANCH_B,
      onDate: "2026-10-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.close?.endReason).toBe("branch_transfer");
    expect(result.plan.open).toEqual({
      branchId: BRANCH_B,
      classId: CLASS_B,
      startDate: "2026-10-01",
    });
    expect(result.plan.student).toEqual({ branchId: BRANCH_B, classId: CLASS_B });
  });

  it("never touches the student code — it is the student's identity (rule 10.3)", () => {
    const result = planBranchTransfer(activeStudent(), {
      branchId: BRANCH_B,
      classId: CLASS_B,
      classBranchId: BRANCH_B,
      onDate: "2026-10-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.plan.student)).not.toContain("studentCode");
  });

  it("refuses a target class that is not in the target branch", () => {
    const result = planBranchTransfer(activeStudent(), {
      branchId: BRANCH_B,
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2026-10-01",
    });
    expect(result).toEqual({ ok: false, error: "CLASS_NOT_IN_BRANCH" });
  });

  it("refuses a transfer to the branch the student is already in", () => {
    const result = planBranchTransfer(activeStudent(), {
      branchId: BRANCH_A,
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2026-10-01",
    });
    expect(result).toEqual({ ok: false, error: "SAME_BRANCH" });
  });
});

describe("planArchive", () => {
  it("closes the enrollment and records the date and reason", () => {
    const result = planArchive(activeStudent(), {
      leftDate: "2026-11-30",
      leaveReason: "انتقل لمحافظة أخرى",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.close?.endReason).toBe("archived");
    expect(result.plan.open).toBeNull();
    expect(result.plan.student).toEqual({
      status: "archived",
      leftDate: "2026-11-30",
      leaveReason: "انتقل لمحافظة أخرى",
    });
  });

  it("trims the reason so whitespace cannot pass for one", () => {
    const result = planArchive(activeStudent(), { leftDate: "2026-11-30", leaveReason: "  سفر  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.student.leaveReason).toBe("سفر");
  });

  it("refuses a blank reason", () => {
    expect(planArchive(activeStudent(), { leftDate: "2026-11-30", leaveReason: "   " })).toEqual({
      ok: false,
      error: "REASON_REQUIRED",
    });
  });

  it("refuses to archive someone already archived", () => {
    const result = planArchive(activeStudent({ status: "archived" }), {
      leftDate: "2026-11-30",
      leaveReason: "سفر",
    });
    expect(result).toEqual({ ok: false, error: "STUDENT_ARCHIVED" });
  });
});

describe("planRestore", () => {
  const archived = activeStudent({ status: "archived", current: null });

  it("reopens an enrollment and clears the leaving fields", () => {
    const result = planRestore(archived, {
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2027-01-05",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.close).toBeNull();
    expect(result.plan.open).toEqual({
      branchId: BRANCH_A,
      classId: CLASS_2,
      startDate: "2027-01-05",
    });
    // Leaving a stale left_date behind would trip the students_archived_has_reason check.
    expect(result.plan.student).toEqual({
      classId: CLASS_2,
      status: "active",
      leftDate: null,
      leaveReason: null,
    });
  });

  it("refuses to restore an active student", () => {
    const result = planRestore(activeStudent(), {
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2027-01-05",
    });
    expect(result).toEqual({ ok: false, error: "STUDENT_ALREADY_ACTIVE" });
  });

  it("refuses to restore into another branch's class", () => {
    const result = planRestore(archived, {
      classId: CLASS_B,
      classBranchId: BRANCH_B,
      onDate: "2027-01-05",
    });
    expect(result).toEqual({ ok: false, error: "CLASS_NOT_IN_BRANCH" });
  });
});

describe("a full lifecycle", () => {
  it("survives enrol → change class → transfer → archive → restore", () => {
    let state = activeStudent();

    const changed = planClassChange(state, {
      classId: CLASS_2,
      classBranchId: BRANCH_A,
      onDate: "2026-10-01",
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    state = {
      ...state,
      classId: CLASS_2,
      current: { id: "enr-2", branchId: BRANCH_A, classId: CLASS_2, startDate: "2026-10-01" },
    };

    const transferred = planBranchTransfer(state, {
      branchId: BRANCH_B,
      classId: CLASS_B,
      classBranchId: BRANCH_B,
      onDate: "2026-11-01",
    });
    expect(transferred.ok).toBe(true);
    if (!transferred.ok) return;
    state = {
      ...state,
      branchId: BRANCH_B,
      classId: CLASS_B,
      current: { id: "enr-3", branchId: BRANCH_B, classId: CLASS_B, startDate: "2026-11-01" },
    };

    const archivedResult = planArchive(state, { leftDate: "2026-12-01", leaveReason: "سفر" });
    expect(archivedResult.ok).toBe(true);
    state = { ...state, status: "archived", current: null };

    // Restoring lands them in their LAST branch, not their first.
    const restored = planRestore(state, {
      classId: CLASS_B,
      classBranchId: BRANCH_B,
      onDate: "2027-01-05",
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.plan.open?.branchId).toBe(BRANCH_B);
  });
});
