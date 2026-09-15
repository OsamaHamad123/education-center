import { describe, expect, it } from "vitest";
import { generateAccessCode, isWeakAccessCode } from "./access-code";

describe("isWeakAccessCode", () => {
  it("rejects a repeated digit", () => {
    expect(isWeakAccessCode("111111")).toBe(true);
    expect(isWeakAccessCode("000000")).toBe(true);
  });

  it("rejects a straight run in either direction", () => {
    expect(isWeakAccessCode("123456")).toBe(true);
    expect(isWeakAccessCode("654321")).toBe(true);
  });

  it("rejects anything that is not exactly six digits", () => {
    for (const bad of ["12345", "1234567", "12a456", ""]) {
      expect(isWeakAccessCode(bad), bad).toBe(true);
    }
  });

  it("accepts an ordinary code", () => {
    expect(isWeakAccessCode("481937")).toBe(false);
    expect(isWeakAccessCode("100200")).toBe(false);
  });
});

describe("generateAccessCode", () => {
  it("produces six digits", () => {
    const code = generateAccessCode(Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 3));
    expect(code).toMatch(/^\d{6}$/);
  });

  it("never returns a weak code, even when the first draw is one", () => {
    // Every byte identical would give 111111 at offset 0; it must keep looking.
    const allOnes = new Uint8Array(32).fill(1);
    expect(() => generateAccessCode(allOnes)).toThrow(/randomness/);

    // A buffer whose first draw is weak but which contains a usable one later.
    const bytes = Uint8Array.from([1, 1, 1, 1, 1, 1, 4, 8, 1, 9, 3, 7]);
    expect(isWeakAccessCode(generateAccessCode(bytes))).toBe(false);
  });

  it("refuses to run with too little randomness rather than repeating itself", () => {
    expect(() => generateAccessCode(new Uint8Array(3))).toThrow(/bytes/);
  });
});
