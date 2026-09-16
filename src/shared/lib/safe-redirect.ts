/**
 * Where it is safe to send somebody after they sign in
 * (docs/AUDIT-2026-09.md, finding 5).
 *
 * `proxy.ts` puts the page an anonymous visitor was heading for into `?next=`, and the
 * login form sends them there afterwards. The check used to be `next.startsWith("/")`,
 * which `//evil.com` passes: it is a protocol-relative URL, so the browser reads it as
 * `https://evil.com`.
 *
 * What made that worth fixing is that the link is to the REAL domain. The victim signs
 * in legitimately, and only the last step — a copy of the login page asking them to
 * sign in "again" — belongs to the attacker.
 *
 * So this does not pattern-match the ways a URL can escape an origin; there are more of
 * them than anyone remembers (`//host`, `/\host`, `/%5Chost`, a `\t` the parser drops).
 * It resolves the candidate against the origin it will actually be opened in and keeps
 * it only if it stayed there.
 */
export function safeRedirectPath(candidate: string | null | undefined, origin: string): string {
  if (!candidate) return "/";

  let resolved: URL;
  try {
    resolved = new URL(candidate, origin);
  } catch {
    return "/";
  }

  // A different origin — or a `javascript:` / `data:` URL, whose origin is "null".
  if (resolved.origin !== new URL(origin).origin) return "/";

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
