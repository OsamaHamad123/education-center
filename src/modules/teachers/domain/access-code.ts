/**
 * Teacher access codes (PROJECT_PLAN section 9).
 *
 * A teacher signs in with their phone number and a six-digit code. Six digits is only
 * a million combinations, so the code is NOT a password: it is a low-friction
 * credential for a low-privilege role, shown once and resettable. Everything that
 * makes it safe enough lives elsewhere — teachers can only read their own data and
 * mark their own attendance, and sign-in is rate limited per IP.
 */

export const ACCESS_CODE_LENGTH = 6;

/**
 * Rejects codes that a person would read out as "obviously the default": all the same
 * digit, or a straight run. They are the first things anyone would try.
 */
export function isWeakAccessCode(code: string): boolean {
  if (!/^\d{6}$/.test(code)) return true;
  if (/^(\d)\1{5}$/.test(code)) return true;

  const digits = [...code].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) + 1);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) - 1);
  return ascending || descending;
}

/**
 * Builds a code from caller-supplied randomness, rejecting weak draws. `randomBytes`
 * must be cryptographically random — the shape of this function keeps that decision
 * at the call site, where `node:crypto` lives, and keeps this file testable.
 */
export function generateAccessCode(randomBytes: Uint8Array): string {
  if (randomBytes.length < ACCESS_CODE_LENGTH) {
    throw new Error(`generateAccessCode needs at least ${ACCESS_CODE_LENGTH} bytes`);
  }

  // Walk the buffer for a draw that is not obviously guessable.
  for (let offset = 0; offset + ACCESS_CODE_LENGTH <= randomBytes.length; offset++) {
    let code = "";
    for (let i = 0; i < ACCESS_CODE_LENGTH; i++) {
      code += String((randomBytes[offset + i] ?? 0) % 10);
    }
    if (!isWeakAccessCode(code)) return code;
  }

  throw new Error("Could not draw a usable access code — supply more randomness");
}
