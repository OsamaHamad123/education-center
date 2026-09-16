import { describe, expect, it } from "vitest";
import { toDisplayDate, toIsoDate } from "./date-text";

describe("toDisplayDate", () => {
  it("shows a day the way the whole product shows days", () => {
    expect(toDisplayDate("2026-09-16")).toBe("16/09/2026");
    expect(toDisplayDate("2026-01-09")).toBe("09/01/2026");
  });

  it("shows nothing rather than showing a value it cannot read", () => {
    expect(toDisplayDate("")).toBe("");
    expect(toDisplayDate("abc")).toBe("");
    expect(toDisplayDate("2026-02-31")).toBe("");
  });
});

describe("toIsoDate", () => {
  it("reads what a person types", () => {
    expect(toIsoDate("16/09/2026")).toBe("2026-09-16");
    expect(toIsoDate("9/1/2026")).toBe("2026-01-09");
    expect(toIsoDate(" 16 / 09 / 2026 ")).toBe("2026-09-16");
  });

  it("accepts the other separators people use", () => {
    expect(toIsoDate("16-09-2026")).toBe("2026-09-16");
    expect(toIsoDate("16.09.2026")).toBe("2026-09-16");
  });

  it("stays quiet while the date is still being typed", () => {
    expect(toIsoDate("1")).toBeNull();
    expect(toIsoDate("16/")).toBeNull();
    expect(toIsoDate("16/09")).toBeNull();
    expect(toIsoDate("16/09/20")).toBeNull();
  });

  it("refuses a day that does not exist, however well formed", () => {
    expect(toIsoDate("31/02/2026")).toBeNull();
    expect(toIsoDate("01/13/2026")).toBeNull();
    expect(toIsoDate("00/09/2026")).toBeNull();
  });

  it("reads day-first, which is the entire point", () => {
    // Typed as the ninth of January. An American reading would make it 1 September.
    expect(toIsoDate("09/01/2026")).toBe("2026-01-09");
  });
});
