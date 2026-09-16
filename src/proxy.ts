import { NextResponse, type NextRequest } from "next/server";

/**
 * Route protection (PROJECT_PLAN section 9). Next.js 16 calls this file `proxy.ts`.
 *
 * This layer ONLY checks whether a session cookie is present, so it can stay on the
 * edge and stay fast. It is a redirect, not a security boundary: the real
 * authorization happens server-side in `createAction` and in the query layer, and
 * underneath both, in RLS. Never move a permission decision up here — a cookie's
 * presence says nothing about who owns it.
 */
const SESSION_COOKIE = "ec.session_token";

/**
 * `/portal` is public to THIS layer and not public at all underneath: it carries its own
 * session cookie, and every query behind it re-verifies the parent in SQL. Leaving it out
 * sent parents to the staff login, which is both wrong and a little insulting.
 */
const PUBLIC_PREFIXES = ["/login", "/lookup", "/portal", "/api/auth", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has(SESSION_COOKIE) || request.cookies.has(`__Secure-${SESSION_COOKIE}`);

  if (!hasSession) {
    const login = new URL("/login", request.url);
    // Bring them back where they were heading once they are signed in.
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand|uploads).*)"],
};
