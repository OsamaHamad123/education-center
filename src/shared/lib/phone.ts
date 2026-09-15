/**
 * Egyptian mobile numbers, normalized to E.164 (`+201XXXXXXXXX`).
 *
 * Numbers are identity here: a teacher's username is their normalized phone, and a
 * parent looks their child up with the last four digits of theirs. So normalization
 * has to be total and stable — `01012345678`, `+2 010 1234 5678` and `0020101234-5678`
 * must all land on the same string.
 */

/** Mobile network prefixes in Egypt: Vodafone 010, Etisalat 011, Orange 012, WE 015. */
const EGYPT_MOBILE_PREFIXES = ["10", "11", "12", "15"] as const;

const EGYPT_COUNTRY_CODE = "20";

/** A normalized Egyptian mobile number: `+20` followed by 10 digits starting with 1. */
export type NormalizedPhone = string;

export function isValidEgyptianMobile(phone: string): boolean {
  return normalizeEgyptianPhone(phone) !== null;
}

/**
 * Returns the E.164 form, or `null` when the input is not a valid Egyptian mobile.
 * Callers decide what a failure means; this function never throws.
 */
export function normalizeEgyptianPhone(phone: string): NormalizedPhone | null {
  if (typeof phone !== "string") return null;

  // Accept Arabic-Indic digits too — phones get pasted from WhatsApp.
  const digits = toWesternDigits(phone).replace(/\D/g, "");
  if (digits.length === 0) return null;

  const national = toNationalSignificant(digits);
  if (national === null) return null;

  // `national` is the number without the trunk "0", so `010…` arrives here as `10…`.
  const prefix = national.slice(0, 2);
  if (!EGYPT_MOBILE_PREFIXES.includes(prefix as (typeof EGYPT_MOBILE_PREFIXES)[number])) {
    return null;
  }

  return `+${EGYPT_COUNTRY_CODE}${national}`;
}

/**
 * The 10-digit national significant number (`1XXXXXXXXX`), or null.
 * Handles `00201…`, `201…`, `01…` and bare `1…`.
 */
function toNationalSignificant(digits: string): string | null {
  let rest = digits;

  if (rest.startsWith("00")) rest = rest.slice(2);
  if (rest.startsWith(EGYPT_COUNTRY_CODE) && rest.length > 10) rest = rest.slice(2);
  if (rest.startsWith("0")) rest = rest.slice(1);

  if (rest.length !== 10 || !rest.startsWith("1")) return null;
  return rest;
}

/** The last four digits, used by the public lookup (PROJECT_PLAN section 10.8). */
export function lastFourDigits(phone: NormalizedPhone): string {
  return phone.slice(-4);
}

/** Local display form: `0101 234 5678`. */
export function formatPhoneForDisplay(phone: NormalizedPhone): string {
  const national = phone.replace(`+${EGYPT_COUNTRY_CODE}`, "");
  if (national.length !== 10) return phone;
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/**
 * Masks a phone for logs: `+2010****5678`. Full numbers must never reach a log
 * line (CLAUDE.md, "Never do").
 */
export function maskPhone(phone: NormalizedPhone): string {
  if (phone.length < 8) return "****";
  return `${phone.slice(0, 5)}****${phone.slice(-4)}`;
}

/** A wa.me click-to-chat link — we never send messages automatically (section 10.7). */
export function whatsAppLink(phone: NormalizedPhone): string {
  return `https://wa.me/${phone.replace("+", "")}`;
}

function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
