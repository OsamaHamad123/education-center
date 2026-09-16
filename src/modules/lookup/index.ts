/**
 * Public API of the `lookup` module — استعلام ولي الأمر / الطالب.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/lookup/domain|application|infrastructure|ui` from outside this module.
 */
export {
  formatMaskedName,
  normalizeLastFour,
  normalizeStudentCode,
  validateCredentials,
  type CredentialProblem,
} from "./domain/credentials";
export {
  checkLookupLimits,
  LOOKUP_LIMITS,
  retryAfterMinutes,
  type LimitBreach,
  type LookupLimits,
} from "./domain/rate-limit";
export { limitBreach, lookupStudent, type LookupResult } from "./application/use-cases/lookup-student";
/**
 * The rate limiter's two halves, on the module's public face.
 *
 * The parent portal signs in with the SAME credential this module checks, so it must
 * count against the SAME budget — two doors onto one secret, with separate counters,
 * would hand an attacker twice the guesses by alternating between them. Exporting these
 * is how the portal shares the limiter without deep-importing (CLAUDE.md rule 3).
 */
export { recordAttempt } from "./infrastructure/lookup.repository";
export { LookupForm } from "./ui/lookup-form";
