/**
 * Duplicate detection when enrolling a student (PROJECT_PLAN 10.3).
 *
 * This WARNS, it does not block: brothers share a surname and a parent's phone, and a
 * center that cannot enrol the second brother is worse than one that asks "are you
 * sure?". The decision stays with the person at the desk.
 */

export type ExistingStudent = {
  id: string;
  studentCode: string;
  fullName: string;
  parentPhone: string;
  className: string;
};

/** Collapses the spacing and diacritics that make two spellings of one name differ. */
export function normalizeArabicName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[ً-ْٰ]/g, "") // harakat
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * Candidates are already scoped to the branch by the query; this decides which of
 * them are close enough to mention.
 */
export function findLikelyDuplicates(
  candidate: { fullName: string; parentPhone: string },
  existing: readonly ExistingStudent[],
): ExistingStudent[] {
  const name = normalizeArabicName(candidate.fullName);
  return existing.filter(
    (row) => normalizeArabicName(row.fullName) === name && row.parentPhone === candidate.parentPhone,
  );
}
