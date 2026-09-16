import type { z } from "zod";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type AppError, type Result } from "./result";

/**
 * Running a schema and getting back the same failure the server would send
 * (docs/UX-AUDIT-2026-09.md, finding 6).
 *
 * CLAUDE.md names Zod as validation "shared between client and server", and until now it
 * was shared with nothing: every schema ran on the server only, so a four-character name
 * or a malformed phone cost a full round trip before the person at the desk was told.
 *
 * The point of returning a `Result` with `fieldErrors` — rather than anything nicer — is
 * that it is EXACTLY what `createAction` returns. Every form already renders that shape,
 * so a form gains client-side validation by checking before it calls, and nothing about
 * how it displays the answer changes.
 *
 * It does not replace the server check. The server still validates everything, because a
 * check in the browser is a courtesy to the user and not a control.
 */
export function validate<S extends z.ZodTypeAny>(schema: S, input: unknown): Result<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err("VALIDATION_ERROR", ar.errors.VALIDATION_ERROR, fieldErrorsOf(parsed.error));
}

/**
 * Zod issues, keyed by field, the way the forms read them.
 *
 * Lives here rather than in `create-action` so that the client and the server cannot
 * drift into two different shapes for the same failure.
 */
export function fieldErrorsOf(error: z.ZodError): NonNullable<AppError["fieldErrors"]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}
