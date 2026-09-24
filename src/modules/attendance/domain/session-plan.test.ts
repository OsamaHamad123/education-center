import { describe, expect, it } from "vitest";
import {
  checkMakeUp,
  checkRestore,
  makeUpNeedsCancelling,
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
  const rates = { scientificPiasters: 25_000, literaryPiasters: 20_000 };

  it("pays the substitute their OWN rate, not the absent teacher's", () => {
    expect(
      planSubstitution({
        substituteTeacherId: "t2",
        substituteRates: rates,
        trackApplied: "scientific",
        currentTeacherId: "t1",
        substitutedFromTeacherId: null,
      }),
    ).toEqual({ teacherId: "t2", rateAppliedPiasters: 25_000, substitutedFromTeacherId: "t1" });
  });

  it("uses the track the SESSION was run at, not the substitute's usual one", () => {
    // The class's track was frozen when the session was created; a substitute does
    // not change what kind of lesson it was.
    expect(
      planSubstitution({
        substituteTeacherId: "t2",
        substituteRates: rates,
        trackApplied: "literary",
        currentTeacherId: "t1",
        substitutedFromTeacherId: null,
      }).rateAppliedPiasters,
    ).toBe(20_000);
  });

  it("records whose lesson it was, so the hand-over is not invisible", () => {
    expect(
      planSubstitution({
        substituteTeacherId: "t2",
        substituteRates: rates,
        trackApplied: "scientific",
        currentTeacherId: "t1",
        substitutedFromTeacherId: null,
      }).substitutedFromTeacherId,
    ).toBe("t1");
  });

  it("keeps the FIRST owner through a second hand-over, not the previous one", () => {
    // Ahmad → Khaled → Mona. Whose lesson was it? Ahmad's. It was never Khaled's.
    expect(
      planSubstitution({
        substituteTeacherId: "mona",
        substituteRates: rates,
        trackApplied: "scientific",
        currentTeacherId: "khaled",
        substitutedFromTeacherId: "ahmad",
      }).substitutedFromTeacherId,
    ).toBe("ahmad");
  });

  it("clears the origin when the lesson is handed BACK to it", () => {
    // Otherwise the row would say "taken from Ahmad, taught by Ahmad" — which is not
    // a substitution, and which the CHECK constraint refuses outright.
    expect(
      planSubstitution({
        substituteTeacherId: "ahmad",
        substituteRates: rates,
        trackApplied: "scientific",
        currentTeacherId: "khaled",
        substitutedFromTeacherId: "ahmad",
      }).substitutedFromTeacherId,
    ).toBeNull();
  });
});

describe("checkMakeUp", () => {
  const original = { id: "s1", classId: "c1", sessionDate: "2026-09-13", madeUpBy: null };

  it("accepts a later lesson for the same class", () => {
    expect(checkMakeUp({ original, makeUp: { classId: "c1", sessionDate: "2026-09-16" } })).toBeNull();
  });

  it("accepts the same day — a morning period moved to the afternoon", () => {
    expect(checkMakeUp({ original, makeUp: { classId: "c1", sessionDate: "2026-09-13" } })).toBeNull();
  });

  it("refuses a second make-up for one missed lesson", () => {
    // This is the double payment the whole feature exists to stop, arriving twice.
    expect(
      checkMakeUp({
        original: { ...original, madeUpBy: "s9" },
        makeUp: { classId: "c1", sessionDate: "2026-09-16" },
      }),
    ).toBe("ALREADY_MADE_UP");
  });

  it("refuses another class — those are different students", () => {
    expect(checkMakeUp({ original, makeUp: { classId: "c2", sessionDate: "2026-09-16" } })).toBe(
      "DIFFERENT_CLASS",
    );
  });

  it("refuses a make-up dated before the lesson it makes up for", () => {
    expect(checkMakeUp({ original, makeUp: { classId: "c1", sessionDate: "2026-09-10" } })).toBe(
      "BEFORE_ORIGINAL",
    );
  });
});

describe("makeUpNeedsCancelling", () => {
  it("says yes while the missed lesson still counts for payroll", () => {
    expect(makeUpNeedsCancelling("completed")).toBe(true);
  });

  it("says no when the office already cancelled it", () => {
    expect(makeUpNeedsCancelling("cancelled")).toBe(false);
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

describe("checkRestore", () => {
  it("brings back a cancelled lesson nothing has replaced", () => {
    expect(checkRestore({ status: "cancelled", makeUp: null })).toBeNull();
  });

  it("refuses a lesson that was never cancelled", () => {
    expect(checkRestore({ status: "completed", makeUp: null })).toBe("NOT_CANCELLED");
  });

  it("refuses a lesson somebody has already taught in its place", () => {
    // Restoring it would pay for the missed lesson AND its replacement — the double
    // payment `drizzle/0020` exists to stop, arriving through the restore button.
    expect(checkRestore({ status: "cancelled", makeUp: { status: "completed" } })).toBe("ALREADY_MADE_UP");
  });

  it("allows it once the REPLACEMENT is cancelled — nothing stands in for it then", () => {
    // Which is also what makes the pair undoable in the order it was made.
    expect(checkRestore({ status: "cancelled", makeUp: { status: "cancelled" } })).toBeNull();
  });
});
