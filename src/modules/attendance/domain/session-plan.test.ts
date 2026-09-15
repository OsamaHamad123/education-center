import { describe, expect, it } from "vitest";
import {
  planSessionSnapshot,
  planSubstitution,
  validateCancellation,
  type PeriodSource,
} from "./session-plan";

const RATES = { scientificPiasters: 15_000, literaryPiasters: 12_000 };

function period(overrides: Partial<PeriodSource> = {}): PeriodSource {
  return {
    timetableSlotId: "slot-1",
    subjectName: "الرياضيات",
    periodNumber: 2,
    startTime: "08:45",
    endTime: "09:30",
    teacherId: "t1",
    ...overrides,
  };
}

describe("planSessionSnapshot", () => {
  it("freezes the subject, the times and the rate for this track", () => {
    expect(
      planSessionSnapshot({
        period: period(),
        sessionDate: "2026-09-16",
        classTrack: "scientific",
        teacherRates: RATES,
      }),
    ).toEqual({
      timetableSlotId: "slot-1",
      subjectName: "الرياضيات",
      sessionDate: "2026-09-16",
      periodNumber: 2,
      startTime: "08:45",
      endTime: "09:30",
      teacherId: "t1",
      trackApplied: "scientific",
      rateAppliedPiasters: 15_000,
      isExtra: false,
    });
  });

  it("snapshots the LITERARY rate for a literary class", () => {
    const snapshot = planSessionSnapshot({
      period: period(),
      sessionDate: "2026-09-16",
      classTrack: "literary",
      teacherRates: RATES,
    });

    expect(snapshot.rateAppliedPiasters).toBe(12_000);
    expect(snapshot.trackApplied).toBe("literary");
  });

  it("marks a session with no weekly slot as extra", () => {
    const snapshot = planSessionSnapshot({
      period: period({ timetableSlotId: null }),
      sessionDate: "2026-09-16",
      classTrack: "scientific",
      teacherRates: RATES,
    });

    // The CHECK constraint requires exactly this pairing: extra ⇒ no slot.
    expect(snapshot.isExtra).toBe(true);
    expect(snapshot.timetableSlotId).toBeNull();
  });

  it("snapshots a zero rate without complaint", () => {
    const snapshot = planSessionSnapshot({
      period: period(),
      sessionDate: "2026-09-16",
      classTrack: "scientific",
      teacherRates: { scientificPiasters: 0, literaryPiasters: 0 },
    });

    expect(snapshot.rateAppliedPiasters).toBe(0);
  });
});

describe("planSubstitution", () => {
  it("pays the substitute their OWN rate, not the absent teacher's", () => {
    expect(
      planSubstitution({
        substituteTeacherId: "t2",
        substituteRates: { scientificPiasters: 25_000, literaryPiasters: 20_000 },
        trackApplied: "scientific",
      }),
    ).toEqual({ teacherId: "t2", rateAppliedPiasters: 25_000 });
  });

  it("uses the track the SESSION was run at, not the substitute's usual one", () => {
    // The class's track was frozen when the session was created; a substitute does
    // not change what kind of lesson it was.
    expect(
      planSubstitution({
        substituteTeacherId: "t2",
        substituteRates: { scientificPiasters: 25_000, literaryPiasters: 20_000 },
        trackApplied: "literary",
      }).rateAppliedPiasters,
    ).toBe(20_000);
  });
});

describe("validateCancellation", () => {
  it("requires a reason", () => {
    expect(validateCancellation({ status: "completed", reason: "" })).toBe("REASON_REQUIRED");
    expect(validateCancellation({ status: "completed", reason: "   " })).toBe("REASON_REQUIRED");
  });

  it("accepts a real reason", () => {
    expect(validateCancellation({ status: "completed", reason: "غياب المعلم" })).toBeNull();
  });

  it("refuses to cancel twice", () => {
    expect(validateCancellation({ status: "cancelled", reason: "أي سبب" })).toBe("ALREADY_CANCELLED");
  });
});
