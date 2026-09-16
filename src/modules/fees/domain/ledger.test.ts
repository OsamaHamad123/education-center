import { describe, expect, it } from "vitest";
import {
  balanceOf,
  checkPayment,
  invoiceState,
  isValidPeriod,
  netDue,
  periodOf,
  planForPeriod,
  previousPeriod,
  totalsOf,
  type InvoiceMoney,
} from "./ledger";

function invoice(overrides: Partial<InvoiceMoney> = {}): InvoiceMoney {
  return { amountPiasters: 50_000, discountPiasters: 0, paidPiasters: 0, ...overrides };
}

describe("what is owed", () => {
  it("takes the discount off the amount", () => {
    expect(netDue(invoice({ discountPiasters: 10_000 }))).toBe(40_000);
  });

  it("never goes below zero", () => {
    expect(netDue(invoice({ amountPiasters: 0, discountPiasters: 0 }))).toBe(0);
  });

  it("counts a reversal against what has been collected", () => {
    // A reversal is a negative payment row, so the SUM is what matters — there is no
    // separate "refunded" figure to keep in step.
    expect(balanceOf(invoice({ paidPiasters: 50_000 - 50_000 }))).toBe(50_000);
  });
});

describe("invoiceState", () => {
  it("is unpaid when nothing has been taken", () => {
    expect(invoiceState(invoice())).toBe("unpaid");
  });

  it("is partial after something, but not everything", () => {
    expect(invoiceState(invoice({ paidPiasters: 20_000 }))).toBe("partial");
  });

  it("is paid when the balance reaches zero", () => {
    expect(invoiceState(invoice({ paidPiasters: 50_000 }))).toBe("paid");
  });

  it("is paid when a discount covers the rest", () => {
    expect(invoiceState(invoice({ discountPiasters: 30_000, paidPiasters: 20_000 }))).toBe("paid");
  });

  it("says WAIVED for a fully discounted invoice, not paid", () => {
    // An invoice raised in error is discounted in full. Calling that "paid" would hide
    // the mistake behind a figure that looks like money arrived.
    expect(invoiceState(invoice({ discountPiasters: 50_000 }))).toBe("waived");
  });

  it("says overpaid rather than paid when too much was taken", () => {
    expect(invoiceState(invoice({ paidPiasters: 60_000 }))).toBe("overpaid");
  });

  it("goes back to unpaid after a full reversal", () => {
    expect(invoiceState(invoice({ paidPiasters: 0 }))).toBe("unpaid");
  });
});

describe("checkPayment", () => {
  it("refuses zero and negative amounts", () => {
    expect(checkPayment(invoice(), 0)).toBe("NOT_POSITIVE");
    expect(checkPayment(invoice(), -100)).toBe("NOT_POSITIVE");
  });

  it("refuses a fraction of a piaster", () => {
    expect(checkPayment(invoice(), 10.5)).toBe("NOT_POSITIVE");
  });

  it("refuses more than the balance", () => {
    // Nearly always a typo at the desk — 5000 for 500 — and a ledger that takes it
    // makes somebody chase a refund that should never have existed.
    expect(checkPayment(invoice({ paidPiasters: 45_000 }), 10_000)).toBe("EXCEEDS_BALANCE");
  });

  it("refuses anything at all on a settled invoice", () => {
    expect(checkPayment(invoice({ paidPiasters: 50_000 }), 100)).toBe("NOTHING_DUE");
  });

  it("allows exactly the balance", () => {
    expect(checkPayment(invoice({ paidPiasters: 45_000 }), 5_000)).toBeNull();
  });
});

describe("totalsOf", () => {
  it("adds up a month", () => {
    const totals = totalsOf([
      invoice({ paidPiasters: 50_000 }),
      invoice({ discountPiasters: 10_000, paidPiasters: 0 }),
    ]);
    expect(totals).toEqual({
      billed: 100_000,
      discounted: 10_000,
      collected: 50_000,
      outstanding: 40_000,
    });
  });

  it("does not let an overpaid family cover somebody else's arrears", () => {
    // Summed per invoice, not netted across the class: the office chases the arrears
    // of the family that owes, and a credit elsewhere is not a reason not to.
    const totals = totalsOf([invoice({ paidPiasters: 60_000 }), invoice({ paidPiasters: 0 })]);
    expect(totals.outstanding).toBe(50_000);
  });

  it("returns zeroes for an empty month", () => {
    expect(totalsOf([])).toEqual({ billed: 0, discounted: 0, collected: 0, outstanding: 0 });
  });
});

describe("periods", () => {
  it("reads the month out of a date", () => {
    expect(periodOf("2026-09-16")).toBe("2026-09");
  });

  it("accepts a real month and refuses a made-up one", () => {
    expect(isValidPeriod("2026-09")).toBe(true);
    expect(isValidPeriod("2026-13")).toBe(false);
    expect(isValidPeriod("2026-00")).toBe(false);
    expect(isValidPeriod("2026-9")).toBe(false);
    expect(isValidPeriod(undefined)).toBe(false);
  });

  it("steps back across January", () => {
    expect(previousPeriod("2026-09")).toBe("2026-08");
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });
});

describe("planForPeriod", () => {
  const plans = [
    { effectiveFrom: "2026-01-01", amountPiasters: 40_000 },
    { effectiveFrom: "2026-09-01", amountPiasters: 50_000 },
  ];

  it("uses the price in force at the start of the month", () => {
    expect(planForPeriod(plans, "2026-09")?.amountPiasters).toBe(50_000);
    expect(planForPeriod(plans, "2026-08")?.amountPiasters).toBe(40_000);
  });

  it("still bills an old month at the OLD price after a rise", () => {
    // The entire reason a fee plan has a date. Billing May next year must not restate
    // May at next year's price.
    expect(planForPeriod(plans, "2026-05")?.amountPiasters).toBe(40_000);
  });

  it("returns nothing when no price was in force yet", () => {
    expect(planForPeriod(plans, "2025-12")).toBeNull();
  });

  it("does not care what order the plans arrive in", () => {
    expect(planForPeriod([...plans].reverse(), "2026-09")?.amountPiasters).toBe(50_000);
  });
});
