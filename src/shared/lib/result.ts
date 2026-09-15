/**
 * Use cases return a Result instead of throwing for expected business errors
 * (CLAUDE.md, architecture rule 6). Throwing is reserved for bugs, so an
 * uncaught exception anywhere is always a defect, never a business outcome.
 */

export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "BRANCH_REQUIRED"
  | "RATE_LIMITED"
  | "INTERNAL";

export type AppError = {
  code: AppErrorCode;
  /** Arabic text shown to the user — take it from src/shared/i18n/ar.ts. */
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const err = (
  code: AppErrorCode,
  message: string,
  fieldErrors?: AppError["fieldErrors"],
): Result<never> => ({
  ok: false,
  error: fieldErrors ? { code, message, fieldErrors } : { code, message },
});

/** Narrowing helpers, so call sites read as prose rather than as property checks. */
export const isOk = <T>(result: Result<T>): result is { ok: true; data: T } => result.ok;
export const isErr = <T>(result: Result<T>): result is { ok: false; error: AppError } => !result.ok;

/**
 * Unwraps a Result, throwing on failure. Only for code paths where a failure is
 * genuinely a bug (seeds, tests, invariants) — never in a request handler.
 */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`Unwrapped a failed Result: [${result.error.code}] ${result.error.message}`);
  }
  return result.data;
}

/** Applies a function to the success value, leaving failures untouched. */
export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  return result.ok ? ok(fn(result.data)) : result;
}
