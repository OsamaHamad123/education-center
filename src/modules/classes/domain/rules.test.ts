import { describe, expect, it } from "vitest";
import { canChangeTrack, canDeactivateClass } from "./rules";

describe("canChangeTrack", () => {
  it("allows a change while the class has never run a session", () => {
    expect(canChangeTrack({ sessionCount: 0 })).toBeNull();
  });

  it("locks the track once a session has snapshotted it for payroll", () => {
    expect(canChangeTrack({ sessionCount: 1 })).toBe("TRACK_LOCKED_BY_SESSIONS");
  });
});

describe("canDeactivateClass", () => {
  it("allows deactivating an empty class", () => {
    expect(canDeactivateClass({ activeStudentCount: 0, isCurrentlyActive: true })).toBeNull();
  });

  it("refuses while students would be stranded in it", () => {
    expect(canDeactivateClass({ activeStudentCount: 3, isCurrentlyActive: true })).toBe(
      "HAS_ACTIVE_STUDENTS",
    );
  });

  it("refuses when it is already inactive", () => {
    expect(canDeactivateClass({ activeStudentCount: 0, isCurrentlyActive: false })).toBe("ALREADY_INACTIVE");
  });
});
