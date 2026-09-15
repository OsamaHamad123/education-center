import { describe, expect, it } from "vitest";
import { rateForTrack, ratesChanged, validateRates } from "./rates";

const rates = { scientificPiasters: 15_000, literaryPiasters: 12_000 };

describe("validateRates", () => {
  it("accepts ordinary rates, including zero", () => {
    expect(validateRates(rates)).toBeNull();
    expect(validateRates({ scientificPiasters: 0, literaryPiasters: 0 })).toBeNull();
  });

  it("rejects a negative rate", () => {
    expect(validateRates({ ...rates, literaryPiasters: -1 })).toBe("NEGATIVE");
  });

  it("rejects a fractional piaster — money is integer piasters", () => {
    expect(validateRates({ ...rates, scientificPiasters: 12.5 })).toBe("NOT_INTEGER");
  });

  it("catches a typo that would pay someone 25,000 EGP for one session", () => {
    expect(validateRates({ ...rates, scientificPiasters: 2_500_000 })).toBe("UNREALISTIC");
  });
});

describe("ratesChanged", () => {
  it("is false when nothing moved, so an idle save writes no history", () => {
    expect(ratesChanged(rates, { ...rates })).toBe(false);
  });

  it("is true when either track moved", () => {
    expect(ratesChanged(rates, { ...rates, scientificPiasters: 16_000 })).toBe(true);
    expect(ratesChanged(rates, { ...rates, literaryPiasters: 11_000 })).toBe(true);
  });
});

describe("rateForTrack", () => {
  it("picks the rate that matches the class's track", () => {
    expect(rateForTrack(rates, "scientific")).toBe(15_000);
    expect(rateForTrack(rates, "literary")).toBe(12_000);
  });
});
