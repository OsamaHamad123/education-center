/**
 * Escaping a search term for `LIKE` / `ILIKE` (docs/AUDIT-2026-09.md, finding 10).
 *
 * Not an injection fix — the term is a bound parameter either way, and `%' or 1=1 --`
 * returns nothing. It is a correctness one: `%` and `_` are pattern syntax, so typing
 * `%` into the search box returned the whole register, and `_` matched any single
 * character. A search that quietly means something other than what was typed.
 *
 * The backslash goes first, or it would escape the escapes added after it.
 */
export function likeTerm(search: string): string {
  const escaped = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${escaped}%`;
}
