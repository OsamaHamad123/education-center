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
export { lookupStudent, type LookupResult } from "./application/use-cases/lookup-student";
export { LookupForm } from "./ui/lookup-form";
