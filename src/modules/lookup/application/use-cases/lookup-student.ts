"use server";

import { z } from "zod";
import { attendanceRate } from "@/modules/reports";
import { hashIp, requestMetadata } from "@/shared/actions/audit";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import {
  formatMaskedName,
  normalizeLastFour,
  normalizeStudentCode,
  validateCredentials,
} from "../../domain/credentials";
import { checkLookupLimits, retryAfterMinutes } from "../../domain/rate-limit";
import {
  countRecentFailures,
  pruneOldAttempts,
  recordAttempt,
  recordLookupAudit,
  runPublicLookup,
} from "../../infrastructure/lookup.repository";

/**
 * The public lookup (PROJECT_PLAN 10.8). The only entry point in the system that
 * runs without a session, so it is written as a security feature first.
 *
 * The order below is the design:
 *
 *   1. Normalise and shape-check. A malformed request never reaches the database,
 *      so it cannot be timed and does not burn a rate-limit slot meant for real
 *      attempts.
 *   2. Ask the limiter BEFORE looking anything up. A blocked caller learns nothing
 *      about the code they sent.
 *   3. One SQL call answers "does this code, with these four digits, exist" — both
 *      halves in one predicate, so neither can be probed separately.
 *   4. Record the attempt either way, with a hashed IP.
 *
 * Every failure — unknown code, wrong digits, archived student, feature disabled —
 * returns the SAME message. That is not vagueness; it is the whole defence against
 * enumerating a code that is printed on every timetable in the building.
 */

const lookupSchema = z.object({
  studentCode: z.string().max(40),
  lastFour: z.string().max(10),
});

export type LookupResult = {
  displayName: string;
  branchName: string;
  className: string;
  timetable: {
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
    subjectName: string;
  }[];
  month: { present: number; absent: number; late: number; excused: number; attendancePercent: number };
  term: { present: number; absent: number; late: number; excused: number; attendancePercent: number };
  absences: { date: string; status: "absent" | "late"; notes: string | null; subjectName: string }[];
};

/** The window the "term" figures cover until §16 question 7 gives us real terms. */
const TERM_MONTHS = 12;

export async function lookupStudent(raw: unknown): Promise<Result<LookupResult>> {
  const parsed = lookupSchema.safeParse(raw);
  if (!parsed.success) return err("VALIDATION_ERROR", ar.lookup.notFound);

  const code = normalizeStudentCode(parsed.data.studentCode);
  const lastFour = normalizeLastFour(parsed.data.lastFour);

  const problem = validateCredentials({ code, lastFour });
  // Shape errors are the one case that may say something specific: they are about
  // what the parent typed, not about whether a student exists.
  if (problem) return err("VALIDATION_ERROR", ar.lookup.problems[problem]);

  const request = await requestMetadata();
  const ipHash = hashIp(request.ip ?? "unknown");

  const breach = await limitBreach({ ipHash, code });
  if (breach) {
    // Deliberately not recorded as an attempt: a blocked caller must not be able to
    // extend their own block indefinitely, nor push somebody else's code over the
    // per-code limit by hammering it after they are already shut out.
    return err("RATE_LIMITED", `${ar.lookup.rateLimited} ${retryAfterMinutes(breach)} ${ar.lookup.minutes}`);
  }

  const today = todayInCairo();
  const document = await runPublicLookup({ code, lastFour, from: termStart(today), to: today });

  await recordAttempt({ ipHash, code, success: document !== null });
  // Cheap, indexed, and one less scheduled job to notice has stopped running.
  await pruneOldAttempts();

  if (!document) return err("NOT_FOUND", ar.lookup.notFound);

  // Only a success is audited. `audit_logs` is what an administrator reads when
  // asking who has been looking at a child's record; `lookup_attempts` already
  // holds the failures, and flooding this one must cost a valid code (rule 10.8).
  await recordLookupAudit({ code, ipHash });

  return ok({
    // The full name never left the database; this only adds the full stop.
    displayName: formatMaskedName(document.firstName, document.familyInitial),
    branchName: document.branchName,
    className: document.className,
    timetable: document.timetable,
    // The same percentage the admin's report shows — one definition, imported from
    // the reports module rather than reimplemented for the parent's version.
    month: { ...document.monthCounts, attendancePercent: attendanceRate(document.monthCounts) },
    term: { ...document.termCounts, attendancePercent: attendanceRate(document.termCounts) },
    absences: document.absences,
  });
}

/**
 * The limiter, or nothing when `DISABLE_RATE_LIMIT=1`.
 *
 * The same escape hatch sign-in already uses, and for the same reason: the whole e2e
 * suite runs from one address, so a per-IP budget meant for the internet would block
 * the suite against itself after five deliberately-wrong lookups. It is never set in
 * production — `.env.example` does not mention it and the server refuses nothing
 * without it.
 */
async function limitBreach(input: { ipHash: string; code: string }) {
  if (process.env.DISABLE_RATE_LIMIT === "1") return null;
  return checkLookupLimits(await countRecentFailures(input));
}

function termStart(today: string): string {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - TERM_MONTHS);
  return start.toISOString().slice(0, 10);
}
