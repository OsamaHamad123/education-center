import { asc } from "drizzle-orm";
import { requirePermission } from "@/shared/actions/create-action";
import { db } from "@/shared/db/client";
import { academicTerms } from "@/shared/db/schema";
import { ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { defaultTerm, termRangeFor, type Term } from "../../domain/terms";

/**
 * Reading the academic calendar (§16 question 7).
 *
 * Two readers, and they are very different: the settings screen, which needs a session,
 * and the PUBLIC lookup, which has none at all. `academic_terms_select` is `USING
 * (true)` for exactly that reason — the dates are on a poster in the entrance — so the
 * public reader goes through `db` with no tenant context, like the centre's own name.
 */

/** Every term, oldest first. No session: the lookup and the portal both call this. */
export async function listPublicTerms(): Promise<Term[]> {
  return db
    .select({
      id: academicTerms.id,
      name: academicTerms.name,
      startDate: academicTerms.startDate,
      endDate: academicTerms.endDate,
    })
    .from(academicTerms)
    .orderBy(asc(academicTerms.startDate));
}

/**
 * The window a "term" figure should cover today.
 *
 * The public lookup has shown a parent a "term" percentage since Phase 9 that was really
 * the last twelve months, because there was nothing better to ask. This is the better
 * question — and it still answers twelve months for a centre that has not filled in a
 * calendar, so nothing changes for them.
 */
export async function currentTermRange(today = todayInCairo()): Promise<{ from: string; to: string }> {
  return termRangeFor(await listPublicTerms(), today);
}

export type TermsView = { terms: Term[]; currentId: string | null };

export async function getTerms(): Promise<Result<TermsView>> {
  // `settings.read`, not `settings.manage`: a branch admin's reports offer the terms as
  // a date preset, and reading the calendar is not managing it.
  const auth = await requirePermission("settings.read");
  if (!auth.ok) return auth;

  const terms = await listPublicTerms();
  return ok({ terms, currentId: defaultTerm(terms, todayInCairo())?.id ?? null });
}
