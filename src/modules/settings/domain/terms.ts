/**
 * The academic calendar (§16 question 7; `drizzle/0017`).
 *
 * Pure. A term is a NAMED DATE RANGE and nothing else, so the only logic there is to
 * have is "which one is today in" and "do these two overlap" — and both are worth
 * testing without a database, because both are read by the public lookup, which has no
 * session to be careful on behalf of.
 */

export type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

/**
 * The term a date falls in, or null.
 *
 * Inclusive at both ends: a centre that says the term ends on 15 January means the 15th
 * is a school day. The database forbids overlapping terms, so there is never more than
 * one answer to find.
 */
export function termOn(terms: readonly Term[], date: string): Term | null {
  return terms.find((term) => term.startDate <= date && date <= term.endDate) ?? null;
}

/**
 * The window a "term" figure covers, for a date that falls in no term at all.
 *
 * Summer, or a centre that has not filled the calendar in yet. Falling back to the last
 * twelve months is what the lookup did before terms existed — so a centre that never
 * adds a term sees exactly what it saw, and one that does gets the truth.
 */
export function termRangeFor(terms: readonly Term[], today: string): { from: string; to: string } {
  const term = termOn(terms, today);
  if (term) return { from: term.startDate, to: term.endDate };

  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 12);
  return { from: start.toISOString().slice(0, 10), to: today };
}

/** The term to offer first on a report: today's, else the most recent that has begun. */
export function defaultTerm(terms: readonly Term[], today: string): Term | null {
  const current = termOn(terms, today);
  if (current) return current;

  const started = terms
    .filter((term) => term.startDate <= today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return started[0] ?? null;
}

export type TermProblem = "BACKWARDS" | "OVERLAPS";

/**
 * Whether a term may be saved. The database enforces both of these too — an exclusion
 * constraint and a check — and this exists so the refusal arrives as an Arabic sentence
 * rather than as a constraint violation.
 */
export function checkTerm(
  candidate: { startDate: string; endDate: string; id?: string | undefined },
  existing: readonly Term[],
): TermProblem | null {
  if (candidate.endDate < candidate.startDate) return "BACKWARDS";

  const clashes = existing.some(
    (term) =>
      term.id !== candidate.id &&
      // Two closed ranges overlap unless one ends before the other starts.
      term.startDate <= candidate.endDate &&
      candidate.startDate <= term.endDate,
  );
  return clashes ? "OVERLAPS" : null;
}
