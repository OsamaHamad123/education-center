import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

const ORIGIN = "https://school.example";

describe("safeRedirectPath", () => {
  it("keeps an ordinary path, with its query and hash", () => {
    expect(safeRedirectPath("/students?page=2#top", ORIGIN)).toBe("/students?page=2#top");
  });

  it("falls back to the dashboard when there is nothing to go back to", () => {
    expect(safeRedirectPath(null, ORIGIN)).toBe("/");
    expect(safeRedirectPath(undefined, ORIGIN)).toBe("/");
    expect(safeRedirectPath("", ORIGIN)).toBe("/");
  });

  it("refuses a protocol-relative URL, which the old check let through", () => {
    // `//evil.com` starts with "/" — that is the whole bug.
    expect(safeRedirectPath("//evil.com", ORIGIN)).toBe("/");
    expect(safeRedirectPath("//evil.com/login", ORIGIN)).toBe("/");
  });

  it("refuses a backslash, which browsers normalise into a slash", () => {
    expect(safeRedirectPath("/\\evil.com", ORIGIN)).toBe("/");
    expect(safeRedirectPath("\\\\evil.com", ORIGIN)).toBe("/");
  });

  it("refuses another origin, spelled out in full", () => {
    expect(safeRedirectPath("https://evil.com/login", ORIGIN)).toBe("/");
    expect(safeRedirectPath("http://school.example/students", ORIGIN)).toBe("/");
  });

  it("refuses a scheme that is not a page at all", () => {
    expect(safeRedirectPath("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>", ORIGIN)).toBe("/");
  });

  it("keeps an absolute URL back to the same origin", () => {
    expect(safeRedirectPath(`${ORIGIN}/teachers`, ORIGIN)).toBe("/teachers");
  });

  it("does not let a traversal climb out of the origin", () => {
    // `new URL` resolves the dots; what matters is that the result is still local.
    expect(safeRedirectPath("/../../etc/passwd", ORIGIN)).toBe("/etc/passwd");
  });
});
