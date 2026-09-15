import { describe, expect, it } from "vitest";
import { logoFileName, MAX_LOGO_BYTES, validateLogo } from "./logo";

describe("validateLogo", () => {
  it("accepts the supported image types", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(validateLogo({ size: 1024, type }), type).toBeNull();
    }
  });

  it("rejects an empty file", () => {
    expect(validateLogo({ size: 0, type: "image/png" })).toBe("EMPTY");
  });

  it("rejects a file over the size limit", () => {
    expect(validateLogo({ size: MAX_LOGO_BYTES + 1, type: "image/png" })).toBe("TOO_LARGE");
  });

  it("rejects anything not on the allowlist, including things that merely look safe", () => {
    for (const type of ["text/html", "application/pdf", "image/gif", "", "image/png; x=1"]) {
      expect(validateLogo({ size: 1024, type }), type).toBe("UNSUPPORTED_TYPE");
    }
  });
});

describe("logoFileName", () => {
  it("derives the extension from the content type, never from the upload's name", () => {
    expect(logoFileName("image/png", "abc")).toBe("logo-abc.png");
    expect(logoFileName("image/jpeg", "abc")).toBe("logo-abc.jpg");
    expect(logoFileName("image/svg+xml", "abc")).toBe("logo-abc.svg");
  });

  it("produces a name with no path separators", () => {
    expect(logoFileName("image/png", "a1b2")).not.toMatch(/[/\\]/);
  });
});
