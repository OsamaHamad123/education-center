import { describe, expect, it } from "vitest";
import { canChangeBranchCode, canDeactivateBranch, normalizeBranchCode } from "./rules";

describe("canDeactivateBranch", () => {
  it("allows deactivating a branch that still has students — data is kept, not deleted", () => {
    expect(
      canDeactivateBranch({ activeStudentCount: 120, activeBranchCount: 3, isCurrentlyActive: true }),
    ).toBeNull();
  });

  it("refuses to deactivate the last active branch", () => {
    expect(
      canDeactivateBranch({ activeStudentCount: 0, activeBranchCount: 1, isCurrentlyActive: true }),
    ).toBe("LAST_ACTIVE_BRANCH");
  });

  it("refuses when the branch is already inactive", () => {
    expect(
      canDeactivateBranch({ activeStudentCount: 0, activeBranchCount: 3, isCurrentlyActive: false }),
    ).toBe("BRANCH_ALREADY_INACTIVE");
  });
});

describe("canChangeBranchCode", () => {
  it("allows a change while the branch has no students", () => {
    expect(canChangeBranchCode({ studentCount: 0 })).toBeNull();
  });

  it("freezes the code once a student code has been issued from it", () => {
    expect(canChangeBranchCode({ studentCount: 1 })).toBe("CODE_LOCKED_BY_STUDENTS");
  });
});

describe("normalizeBranchCode", () => {
  it("upper-cases and trims", () => {
    expect(normalizeBranchCode("  obr ")).toBe("OBR");
    expect(normalizeBranchCode("nsr")).toBe("NSR");
  });
});
