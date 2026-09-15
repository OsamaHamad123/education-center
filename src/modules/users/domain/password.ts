/**
 * Temporary passwords for newly created admin accounts (PROJECT_PLAN section 9).
 *
 * Shown to the super admin exactly once, then forced to change on first login. Pure
 * TypeScript apart from the caller-supplied randomness, so it can be unit tested.
 */

/** Ambiguous glyphs are left out: these get read aloud and typed by hand. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const LENGTH = 12;

export function generateTemporaryPassword(randomBytes: Uint8Array): string {
  if (randomBytes.length < LENGTH) {
    throw new Error(`generateTemporaryPassword needs at least ${LENGTH} bytes`);
  }
  let out = "";
  for (let i = 0; i < LENGTH; i++) {
    const byte = randomBytes[i] ?? 0;
    out += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return out;
}

export function isAmbiguousFree(password: string): boolean {
  return !/[0O1lI]/.test(password);
}
