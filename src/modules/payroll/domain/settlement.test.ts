import { describe, expect, it } from "vitest";
import {
  canEditSettledPeriod,
  checkSettlement,
  isSettled,
  paidTotal,
  planBulkSettlement,
  settlementState,
  type BulkCandidate,
  type RunRow,
} from "./settlement";

const paid = (amount: number): RunRow => ({
  amountPiasters: amount,
  sessionsCount: 10,
  reversesId: null,
});
const reversal = (amount: number): RunRow => ({
  amountPiasters: -amount,
  sessionsCount: 10,
  reversesId: "run-1",
});

describe("what has been paid", () => {
  it("nets a reversal against its settlement", () => {
    expect(paidTotal([paid(100_000), reversal(100_000)])).toBe(0);
  });

  it("adds two part-payments", () => {
    expect(paidTotal([paid(60_000), paid(40_000)])).toBe(100_000);
  });
});

describe("isSettled", () => {
  it("is false before anything is paid", () => {
    expect(isSettled([])).toBe(false);
  });

  it("is true once money is out the door", () => {
    expect(isSettled([paid(100_000)])).toBe(true);
  });

  it("goes back to FALSE after a reversal", () => {
    // Otherwise a settlement recorded by mistake would lock that month's registers for
    // ever, and the only way out would be a developer.
    expect(isSettled([paid(100_000), reversal(100_000)])).toBe(false);
  });
});

describe("settlementState", () => {
  it("reads unsettled with nothing paid", () => {
    expect(settlementState([], 100_000)).toBe("unsettled");
  });

  it("reads settled when the payment matches the computed figure", () => {
    expect(settlementState([paid(100_000)], 100_000)).toBe("settled");
  });

  it("reads partial when less was handed over than is owed", () => {
    expect(settlementState([paid(40_000)], 100_000)).toBe("partial");
  });

  it("reads STALE when the register changed after the money did", () => {
    // The whole reason sessions_count is snapshotted: this is a discrepancy somebody
    // has to look at, not a figure to quietly overwrite.
    expect(settlementState([paid(100_000)], 80_000)).toBe("stale");
  });
});

describe("checkSettlement", () => {
  const base = { runs: [], computedPiasters: 100_000, period: "2026-08", currentPeriod: "2026-09" };

  it("allows a finished month with something owed", () => {
    expect(checkSettlement(base)).toBeNull();
  });

  it("allows the CURRENT month — a centre may pay mid-month", () => {
    expect(checkSettlement({ ...base, period: "2026-09" })).toBeNull();
  });

  it("refuses a month that has not started", () => {
    expect(checkSettlement({ ...base, period: "2026-10" })).toBe("FUTURE_PERIOD");
  });

  it("refuses a month with nothing owed", () => {
    expect(checkSettlement({ ...base, computedPiasters: 0 })).toBe("NOTHING_TO_PAY");
  });

  it("refuses paying the same month twice", () => {
    expect(checkSettlement({ ...base, runs: [paid(100_000)] })).toBe("ALREADY_SETTLED");
  });

  it("allows it again after a reversal", () => {
    expect(checkSettlement({ ...base, runs: [paid(100_000), reversal(100_000)] })).toBeNull();
  });
});

describe("canEditSettledPeriod", () => {
  it("allows editing a month nobody has been paid for", () => {
    expect(canEditSettledPeriod([])).toBe(true);
  });

  it("refuses editing a month whose money has been handed over", () => {
    expect(canEditSettledPeriod([paid(100_000)])).toBe(false);
  });

  it("allows it again once the settlement is reversed", () => {
    expect(canEditSettledPeriod([paid(100_000), reversal(100_000)])).toBe(true);
  });
});

describe("planBulkSettlement", () => {
  const candidate = (over: Partial<BulkCandidate> & { teacherId: string }): BulkCandidate => ({
    branchId: "b1",
    computedPiasters: 100_000,
    sessions: 10,
    runs: [],
    ...over,
  });

  it("writes one row per teacher, never one combined row", () => {
    // The grain matters: a reversal has to be able to undo ONE teacher.
    const plan = planBulkSettlement([candidate({ teacherId: "t1" }), candidate({ teacherId: "t2" })]);
    expect(plan.toPay).toHaveLength(2);
    expect(plan.toPay.map((row) => row.teacherId)).toEqual(["t1", "t2"]);
  });

  it("skips a teacher already paid, rather than failing the whole run", () => {
    const plan = planBulkSettlement([
      candidate({
        teacherId: "paid",
        runs: [{ amountPiasters: 100_000, sessionsCount: 10, reversesId: null }],
      }),
      candidate({ teacherId: "owed" }),
    ]);
    expect(plan.alreadySettled).toEqual(["paid"]);
    expect(plan.toPay.map((row) => row.teacherId)).toEqual(["owed"]);
  });

  it("pays again after a reversal, because the money came back", () => {
    const plan = planBulkSettlement([
      candidate({
        teacherId: "t1",
        runs: [
          { amountPiasters: 100_000, sessionsCount: 10, reversesId: null },
          { amountPiasters: -100_000, sessionsCount: 10, reversesId: "r1" },
        ],
      }),
    ]);
    expect(plan.toPay.map((row) => row.teacherId)).toEqual(["t1"]);
  });

  it("skips a teacher who is owed nothing", () => {
    const plan = planBulkSettlement([candidate({ teacherId: "t1", computedPiasters: 0, sessions: 0 })]);
    expect(plan.nothingToPay).toEqual(["t1"]);
    expect(plan.toPay).toEqual([]);
  });

  it("carries the computed amount and session count onto the row", () => {
    const plan = planBulkSettlement([candidate({ teacherId: "t1", computedPiasters: 87_500, sessions: 7 })]);
    expect(plan.toPay[0]).toEqual({
      teacherId: "t1",
      branchId: "b1",
      amountPiasters: 87_500,
      sessionsCount: 7,
    });
  });
});
