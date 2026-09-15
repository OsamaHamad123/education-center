import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, isAmbiguousFree } from "./password";

const bytes = (fill: number) => new Uint8Array(16).fill(fill);

describe("generateTemporaryPassword", () => {
  it("produces a 12 character password", () => {
    expect(generateTemporaryPassword(bytes(7))).toHaveLength(12);
  });

  it("avoids glyphs that get confused when read aloud or typed", () => {
    for (let seed = 0; seed < 64; seed++) {
      const password = generateTemporaryPassword(
        Uint8Array.from({ length: 16 }, (_, i) => (seed * 7 + i * 13) % 256),
      );
      expect(isAmbiguousFree(password), password).toBe(true);
    }
  });

  it("refuses to run with too little randomness rather than repeating itself", () => {
    expect(() => generateTemporaryPassword(new Uint8Array(4))).toThrow(/bytes/);
  });
});
