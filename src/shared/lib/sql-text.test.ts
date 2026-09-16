import { describe, expect, it } from "vitest";
import { likeTerm } from "./sql-text";

describe("likeTerm", () => {
  it("wraps an ordinary search in wildcards of its own", () => {
    expect(likeTerm("محمد")).toBe("%محمد%");
    expect(likeTerm("NSR-26")).toBe("%NSR-26%");
  });

  it("takes the wildcards away from the person typing", () => {
    // `%` used to return every student in the branch.
    expect(likeTerm("%")).toBe("%\\%%");
    expect(likeTerm("_")).toBe("%\\_%");
    expect(likeTerm("a%b_c")).toBe("%a\\%b\\_c%");
  });

  it("escapes the escape character first, so it cannot eat the others", () => {
    expect(likeTerm("\\")).toBe("%\\\\%");
    expect(likeTerm("\\%")).toBe("%\\\\\\%%");
  });

  it("leaves an injection attempt as the literal text it is", () => {
    // It was never injection — the term is bound — but it must search for itself.
    expect(likeTerm("' or 1=1 --")).toBe("%' or 1=1 --%");
  });
});
