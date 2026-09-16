import { describe, expect, it } from "vitest";
import { checkLookupLimits, LOOKUP_LIMITS, retryAfterMinutes } from "./rate-limit";

describe("checkLookupLimits", () => {
  it("lets a parent through on their first try", () => {
    expect(checkLookupLimits({ byIp: 0, byCode: 0 })).toBeNull();
  });

  it("lets four failures through and blocks the fifth", () => {
    expect(checkLookupLimits({ byIp: 4, byCode: 0 })).toBeNull();
    expect(checkLookupLimits({ byIp: 5, byCode: 0 })).toBe("IP_BLOCKED");
  });

  it("blocks by CODE even when every request came from a different address", () => {
    // The distributed attack on one child's four digits: the per-IP count is zero
    // for every single request, and the per-code count is what stops it.
    expect(checkLookupLimits({ byIp: 0, byCode: 5 })).toBe("CODE_BLOCKED");
  });

  it("reports the IP breach first when both are over", () => {
    expect(checkLookupLimits({ byIp: 9, byCode: 9 })).toBe("IP_BLOCKED");
  });

  it("honours custom limits", () => {
    const strict = { ...LOOKUP_LIMITS, maxFailuresPerIp: 1 };
    expect(checkLookupLimits({ byIp: 1, byCode: 0 }, strict)).toBe("IP_BLOCKED");
  });

  it("uses the limits PROJECT_PLAN 10.8 specifies", () => {
    expect(LOOKUP_LIMITS).toEqual({
      maxFailuresPerIp: 5,
      ipWindowMinutes: 15,
      maxFailuresPerCode: 5,
      codeWindowMinutes: 60,
    });
  });
});

describe("retryAfterMinutes", () => {
  it("is the window of whichever limit was hit", () => {
    expect(retryAfterMinutes("IP_BLOCKED")).toBe(15);
    expect(retryAfterMinutes("CODE_BLOCKED")).toBe(60);
  });
});
