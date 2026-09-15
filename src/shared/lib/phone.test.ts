import { describe, expect, it } from "vitest";
import {
  formatPhoneForDisplay,
  isValidEgyptianMobile,
  lastFourDigits,
  maskPhone,
  normalizeEgyptianPhone,
  whatsAppLink,
} from "./phone";

describe("normalizeEgyptianPhone", () => {
  it("normalizes every way the same number gets written", () => {
    const expected = "+201012345678";
    for (const input of [
      "01012345678",
      "+201012345678",
      "201012345678",
      "00201012345678",
      "010 1234 5678",
      "+20 (010) 1234-5678",
      "٠١٠١٢٣٤٥٦٧٨", // Arabic-Indic digits, as pasted from WhatsApp
    ]) {
      expect(normalizeEgyptianPhone(input), input).toBe(expected);
    }
  });

  it("accepts all four Egyptian mobile networks", () => {
    expect(normalizeEgyptianPhone("01012345678")).toBe("+201012345678"); // Vodafone
    expect(normalizeEgyptianPhone("01112345678")).toBe("+201112345678"); // Etisalat
    expect(normalizeEgyptianPhone("01212345678")).toBe("+201212345678"); // Orange
    expect(normalizeEgyptianPhone("01512345678")).toBe("+201512345678"); // WE
  });

  it("rejects anything that is not an Egyptian mobile", () => {
    for (const input of [
      "",
      "   ",
      "0123456789", // too short
      "010123456789", // too long
      "01312345678", // no such network prefix
      "0221234567", // Cairo landline
      "+966501234567", // Saudi mobile
      "not a phone",
    ]) {
      expect(normalizeEgyptianPhone(input), input).toBeNull();
    }
  });
});

describe("isValidEgyptianMobile", () => {
  it("mirrors normalization", () => {
    expect(isValidEgyptianMobile("01012345678")).toBe(true);
    expect(isValidEgyptianMobile("0221234567")).toBe(false);
  });
});

describe("lookup and display helpers", () => {
  const phone = "+201012345678";

  it("exposes the last four digits used by the public lookup", () => {
    expect(lastFourDigits(phone)).toBe("5678");
  });

  it("formats for display in local form", () => {
    expect(formatPhoneForDisplay(phone)).toBe("0101 234 5678");
  });

  it("builds a wa.me link without the plus sign", () => {
    expect(whatsAppLink(phone)).toBe("https://wa.me/201012345678");
  });
});

describe("maskPhone", () => {
  it("hides the middle digits so logs never carry a full number", () => {
    const masked = maskPhone("+201012345678");
    expect(masked).toBe("+2010****5678");
    expect(masked).not.toContain("123");
  });

  it("degrades safely on a too-short input", () => {
    expect(maskPhone("+2010")).toBe("****");
  });
});
