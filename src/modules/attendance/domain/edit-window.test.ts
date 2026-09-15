import { describe, expect, it } from "vitest";
import { canMarkAttendance, daysBetween, type MarkingRequest } from "./edit-window";

const TODAY = "2026-09-16";

function request(overrides: Partial<MarkingRequest> = {}): MarkingRequest {
  return {
    role: "branch_admin",
    sessionDate: TODAY,
    today: TODAY,
    editWindowDays: 7,
    teacherMarkingEnabled: true,
    ...overrides,
  };
}

describe("canMarkAttendance", () => {
  it("lets anyone mark today", () => {
    for (const role of ["super_admin", "branch_admin", "teacher"] as const) {
      expect(canMarkAttendance(request({ role }))).toBeNull();
    }
  });

  it("refuses a day that has not happened yet, for everyone", () => {
    for (const role of ["super_admin", "branch_admin", "teacher"] as const) {
      expect(canMarkAttendance(request({ role, sessionDate: "2026-09-17" }))).toBe("FUTURE_DATE");
    }
  });
});

describe("a branch admin", () => {
  it("may edit inside the window", () => {
    expect(canMarkAttendance(request({ sessionDate: "2026-09-10" }))).toBeNull();
  });

  it("may edit on the last day of the window", () => {
    // 7 days back with a window of 7 is still inside it.
    expect(canMarkAttendance(request({ sessionDate: "2026-09-09" }))).toBeNull();
  });

  it("is refused one day past the window", () => {
    expect(canMarkAttendance(request({ sessionDate: "2026-09-08" }))).toBe("OUTSIDE_EDIT_WINDOW");
  });

  it("is refused everything but today when the window is zero", () => {
    expect(canMarkAttendance(request({ editWindowDays: 0 }))).toBeNull();
    expect(canMarkAttendance(request({ editWindowDays: 0, sessionDate: "2026-09-15" }))).toBe(
      "OUTSIDE_EDIT_WINDOW",
    );
  });
});

describe("a super admin", () => {
  it("has no window at all — they are the escalation path", () => {
    expect(canMarkAttendance(request({ role: "super_admin", sessionDate: "2024-01-01" }))).toBeNull();
  });

  it("still cannot mark the future", () => {
    expect(canMarkAttendance(request({ role: "super_admin", sessionDate: "2030-01-01" }))).toBe(
      "FUTURE_DATE",
    );
  });
});

describe("a teacher", () => {
  it("may mark only today, whatever the admin window says", () => {
    expect(canMarkAttendance(request({ role: "teacher", sessionDate: "2026-09-15" }))).toBe(
      "TEACHER_TODAY_ONLY",
    );
  });

  it("is refused entirely when the centre turns teacher marking off", () => {
    expect(canMarkAttendance(request({ role: "teacher", teacherMarkingEnabled: false }))).toBe(
      "TEACHER_MARKING_DISABLED",
    );
  });

  it("is told marking is off BEFORE being told the day is wrong", () => {
    // The setting is the reason they see no marking screen at all; the day is a
    // detail that would only confuse them.
    expect(
      canMarkAttendance(
        request({ role: "teacher", sessionDate: "2026-09-01", teacherMarkingEnabled: false }),
      ),
    ).toBe("TEACHER_MARKING_DISABLED");
  });

  it("is refused a future day before anything else", () => {
    expect(
      canMarkAttendance(
        request({ role: "teacher", sessionDate: "2026-09-20", teacherMarkingEnabled: false }),
      ),
    ).toBe("FUTURE_DATE");
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-09-09", "2026-09-16")).toBe(7);
    expect(daysBetween("2026-09-16", "2026-09-16")).toBe(0);
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  });
});
