/**
 * What a parent types, cleaned up (PROJECT_PLAN 10.8).
 *
 * The code is printed on a timetable and read off paper, so it arrives with stray
 * spaces, in either case, and — on an Arabic keyboard — with Arabic-Indic digits.
 * All of that is the parent getting it right; only the SHAPE is validated here.
 *
 * Nothing in this file decides whether a student exists. That question has exactly
 * one answer path, in SQL, and it answers both halves at once so neither can be
 * probed separately (see drizzle/0006).
 */

export type CredentialProblem = "CODE_REQUIRED" | "CODE_MALFORMED" | "DIGITS_REQUIRED";

/** `nsr-26-00001` → `NSR-26-00001`. Arabic-Indic digits are converted first. */
export function normalizeStudentCode(input: string): string {
  return toWesternDigits(input).trim().toUpperCase().replace(/\s+/g, "");
}

/** The last four digits of the parent's phone, as typed. */
export function normalizeLastFour(input: string): string {
  return toWesternDigits(input).replace(/\D/g, "");
}

/**
 * Shape only. A malformed code is rejected before it reaches the database — not to
 * help the user, but because a lookup that never runs cannot be timed, and a request
 * that never runs should not consume a rate-limit slot meant for real attempts.
 */
export function validateCredentials(input: { code: string; lastFour: string }): CredentialProblem | null {
  if (input.code.length === 0) return "CODE_REQUIRED";
  // The seed's shape is BRANCH-YY-NNNNN; accept anything of that family rather than
  // pinning the exact branch codes, which change as branches are added.
  if (!/^[A-Z]{2,5}-\d{2}-\d{4,6}$/.test(input.code)) return "CODE_MALFORMED";
  if (!/^\d{4}$/.test(input.lastFour)) return "DIGITS_REQUIRED";
  return null;
}

/**
 * How the student is named on a public page: first name, then the initial of the
 * family name (open question 3, answered by the owner on 2026-09-16).
 *
 * The database returns the two parts already separated, so the full name never
 * reaches this process. This function only decides the punctuation — which is
 * exactly why it can be unit-tested without a fixture.
 */
export function formatMaskedName(firstName: string, familyInitial: string): string {
  const first = firstName.trim();
  const initial = familyInitial.trim().slice(0, 1);
  return initial ? `${first} ${initial}.` : first;
}

function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}
