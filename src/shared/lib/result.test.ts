import { describe, expect, it } from "vitest";
import { err, isErr, isOk, mapResult, ok, unwrap } from "./result";

describe("Result", () => {
  it("carries the value on success", () => {
    const result = ok({ id: "abc" });
    expect(result.ok).toBe(true);
    expect(isOk(result)).toBe(true);
    if (result.ok) expect(result.data).toEqual({ id: "abc" });
  });

  it("carries the code and Arabic message on failure", () => {
    const result = err("NOT_FOUND", "العنصر المطلوب غير موجود.");
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("العنصر المطلوب غير موجود.");
    }
  });

  it("omits fieldErrors entirely when none were given", () => {
    const result = err("FORBIDDEN", "ممنوع");
    if (!result.ok) expect("fieldErrors" in result.error).toBe(false);
  });

  it("carries per-field validation errors", () => {
    const result = err("VALIDATION_ERROR", "تحقق من البيانات المُدخلة.", {
      parentPhone: ["رقم غير صالح"],
    });
    if (!result.ok) expect(result.error.fieldErrors?.parentPhone).toEqual(["رقم غير صالح"]);
  });

  it("maps over success and leaves failure untouched", () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));

    const failure = err("INTERNAL", "خطأ");
    expect(mapResult(failure, (n: number) => n * 3)).toBe(failure);
  });

  it("unwraps success and throws on failure", () => {
    expect(unwrap(ok("value"))).toBe("value");
    expect(() => unwrap(err("CONFLICT", "تعارض"))).toThrow(/CONFLICT/);
  });
});
