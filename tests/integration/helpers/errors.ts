import { expect } from "vitest";

/**
 * Drizzle wraps a driver error in `Failed query: …` and hangs the real one off
 * `cause`. Asserting on the wrapper's text would pass for ANY failure — including a
 * typo in the test — so these helpers unwrap to the postgres.js error and assert on
 * its `constraint_name` / `code`. That way "the write was rejected" is only ever
 * green when it was rejected for the reason the test names.
 */

export type PgError = Error & {
  code?: string;
  constraint_name?: string;
  table_name?: string;
  detail?: string;
};

/** Postgres error codes we assert on by name rather than by number. */
export const PG_CODE = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  exclusionViolation: "23P01",
  /** Both "violates row-level security policy" and "permission denied". */
  insufficientPrivilege: "42501",
} as const;

function unwrap(error: unknown): PgError {
  // postgres.js hangs its own fields (code, constraint_name) off the Error object.
  let current: unknown = error;
  // Walk to the deepest cause — that is the driver's own error object.
  while (current instanceof Error && current.cause instanceof Error) {
    current = current.cause;
  }
  if (!(current instanceof Error)) {
    throw new Error(`Expected an Error, received: ${String(current)}`);
  }
  return current;
}

/** Asserts the promise rejects, and returns the underlying postgres error. */
export async function pgErrorOf(promise: Promise<unknown>): Promise<PgError> {
  try {
    await promise;
  } catch (error) {
    return unwrap(error);
  }
  throw new Error("Expected the query to be rejected, but it succeeded.");
}

/** Asserts the query was rejected by the named constraint. */
export async function expectConstraintViolation(
  promise: Promise<unknown>,
  constraintName: string,
): Promise<void> {
  const error = await pgErrorOf(promise);
  expect(
    error.constraint_name,
    `expected constraint ${constraintName}, got ${error.constraint_name ?? "(none)"}: ${error.message}`,
  ).toBe(constraintName);
}

/**
 * Asserts the query was rejected by a row level security policy — not by a
 * constraint, and not by a missing table grant.
 */
export async function expectRlsViolation(promise: Promise<unknown>): Promise<void> {
  const error = await pgErrorOf(promise);
  expect(error.code, `expected an RLS rejection, got: ${error.message}`).toBe(PG_CODE.insufficientPrivilege);
  expect(error.message).toMatch(/row-level security policy/i);
}

/** Asserts the query was rejected because the role lacks the table privilege. */
export async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  const error = await pgErrorOf(promise);
  expect(error.code, `expected permission denied, got: ${error.message}`).toBe(PG_CODE.insufficientPrivilege);
  expect(error.message).toMatch(/permission denied/i);
}
