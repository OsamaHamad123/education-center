import { describe, expect, it } from "vitest";
import { calculateEarnings, grandTotal, type PayrollSession } from "./calculate-earnings";

const BRANCH_A = "aaaa";
const BRANCH_B = "bbbb";

function session(overrides: Partial<PayrollSession> = {}): PayrollSession {
  return {
    track: "scientific",
    ratePiasters: 15_000,
    status: "completed",
    branchId: BRANCH_A,
    ...overrides,
  };
}

describe("calculateEarnings", () => {
  it("is zero for a teacher with no sessions", () => {
    expect(calculateEarnings([])).toEqual({ branches: [], sessions: 0, amountPiasters: 0 });
  });

  it("sums the snapshotted rates of completed sessions", () => {
    const earnings = calculateEarnings([session(), session(), session({ ratePiasters: 20_000 })]);

    expect(earnings.amountPiasters).toBe(50_000);
    expect(earnings.sessions).toBe(3);
  });

  it("EXCLUDES cancelled sessions entirely — not as zero, but as absent", () => {
    const earnings = calculateEarnings([session(), session({ status: "cancelled" })]);

    expect(earnings.amountPiasters).toBe(15_000);
    // The count matters as much as the money: a cancelled lesson was not taught.
    expect(earnings.sessions).toBe(1);
  });

  it("keeps the two tracks apart, because they are paid differently", () => {
    const earnings = calculateEarnings([
      session({ track: "scientific", ratePiasters: 15_000 }),
      session({ track: "literary", ratePiasters: 12_000 }),
      session({ track: "literary", ratePiasters: 12_000 }),
    ]);

    const branch = earnings.branches[0];
    expect(branch?.scientific).toEqual({ sessions: 1, amountPiasters: 15_000 });
    expect(branch?.literary).toEqual({ sessions: 2, amountPiasters: 24_000 });
    expect(branch?.amountPiasters).toBe(39_000);
  });

  it("groups by branch, so a shared teacher's work is attributable", () => {
    const earnings = calculateEarnings([
      session({ branchId: BRANCH_A, ratePiasters: 15_000 }),
      session({ branchId: BRANCH_B, ratePiasters: 15_000 }),
      session({ branchId: BRANCH_B, ratePiasters: 15_000 }),
    ]);

    expect(earnings.branches).toHaveLength(2);
    expect(earnings.branches.find((b) => b.branchId === BRANCH_A)?.amountPiasters).toBe(15_000);
    expect(earnings.branches.find((b) => b.branchId === BRANCH_B)?.amountPiasters).toBe(30_000);
    expect(earnings.amountPiasters).toBe(45_000);
  });

  it("uses the rate ON THE SESSION, not one rate for all of them", () => {
    // This is the whole point of the snapshot: two sessions of the same track, run
    // either side of a rise, are paid at what they were worth on the day.
    const earnings = calculateEarnings([
      session({ ratePiasters: 15_000 }),
      session({ ratePiasters: 25_000 }),
    ]);

    expect(earnings.amountPiasters).toBe(40_000);
  });

  it("accepts a zero rate — a volunteer session is still a session", () => {
    const earnings = calculateEarnings([session({ ratePiasters: 0 })]);

    expect(earnings.sessions).toBe(1);
    expect(earnings.amountPiasters).toBe(0);
  });

  it("refuses a fractional rate rather than quietly losing a piaster", () => {
    expect(() => calculateEarnings([session({ ratePiasters: 15_000.5 })])).toThrow(/piasters/);
  });

  it("refuses a negative rate", () => {
    expect(() => calculateEarnings([session({ ratePiasters: -1 })])).toThrow(/piasters/);
  });

  it("does not look at a cancelled session's rate at all", () => {
    // A cancelled row with nonsense in it must not blow up the report for everyone.
    expect(() => calculateEarnings([session({ status: "cancelled", ratePiasters: -99 })])).not.toThrow();
  });

  it("orders branches stably, so two runs print the same report", () => {
    const first = calculateEarnings([session({ branchId: BRANCH_B }), session({ branchId: BRANCH_A })]);
    const second = calculateEarnings([session({ branchId: BRANCH_A }), session({ branchId: BRANCH_B })]);

    expect(first.branches.map((b) => b.branchId)).toEqual(second.branches.map((b) => b.branchId));
  });
});

describe("grandTotal", () => {
  it("adds up several teachers", () => {
    const one = calculateEarnings([session(), session()]);
    const two = calculateEarnings([session({ ratePiasters: 10_000 })]);

    expect(grandTotal([one, two])).toEqual({ sessions: 3, amountPiasters: 40_000 });
  });

  it("is zero for nobody", () => {
    expect(grandTotal([])).toEqual({ sessions: 0, amountPiasters: 0 });
  });
});
