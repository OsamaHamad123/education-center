import type { NextConfig } from "next";

/**
 * Security headers (PROJECT_PLAN 13.1; docs/SECURITY-REVIEW.md, finding 2).
 *
 * Each line below is a specific attack it refuses, not a checklist item:
 *
 * `frame-ancestors 'none'` — the CSP form of X-Frame-Options, and stricter: nothing
 *   may frame this app. Without it a clickjacking page could lay an invisible
 *   `/students/…/edit` over a game and harvest the clicks.
 *
 * `Referrer-Policy` — the default sends the full path to any external host a page
 *   links to. The absence alerts link to `wa.me`, so a referrer carrying
 *   `/students/<uuid>` was a real leak, not a theoretical one. Origin only, now.
 *
 * `X-Content-Type-Options: nosniff` — an uploaded logo served with the wrong type
 *   must not be sniffed into a script.
 *
 * HSTS is production-only: on a developer's machine the app is plain HTTP, and a
 * browser that has once seen `max-age` will refuse to talk to localhost over HTTP
 * for a year afterwards.
 *
 * The CSP allows `'unsafe-inline'` for styles because Tailwind and `next/font` inject
 * them. Scripts are `'self'` plus the nonce-less inline bootstrap Next.js emits, which
 * is why `'unsafe-inline'` appears there too — tightening that needs the nonce plumbing
 * in `proxy.ts` and is recorded as the one loose thread in docs/SECURITY-REVIEW.md.
 *
 * `'unsafe-eval'` is allowed in DEVELOPMENT ONLY. React's dev build uses `eval` to
 * rebuild stack traces across the server/client boundary, so without it every page
 * logs a console error and the error overlay points at the wrong line — which costs
 * more than the rule buys on a machine serving one developer over localhost.
 *
 * In production it is refused, and that is the half of the CSP that blocks most
 * injected payloads. The gate is `NODE_ENV`, which Next sets itself: `next build`
 * cannot produce a bundle carrying the development allowance. `tests/e2e/hardening`
 * asserts on the header a real build actually serves.
 */
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The only outbound destination the app has is its own origin; wa.me is opened as
  // a link, never fetched.
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Nothing in this product needs a camera, a microphone or a location.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(!isDev
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/**
 * The uploads directory holds one file: the centre's logo, and SVG is in its allowlist
 * (docs/AUDIT-2026-09.md, finding 7).
 *
 * An SVG is a document, not just a picture. Served from this origin under the app's own
 * `script-src 'self' 'unsafe-inline'`, a script inside one runs as the app if the file
 * is opened directly rather than through an `<img>`. Only a super admin can upload it,
 * so this is not privilege escalation — it is persistence: a compromised session leaves
 * behind a file that keeps running on the centre's origin afterwards.
 *
 * A second policy on these paths rather than a replacement: two CSP headers are enforced
 * as an intersection, so this can only ever narrow what the page above allows. SVG logos
 * still render as images, which is why the format stays in the allowlist.
 */
const UPLOADS_CSP = ["default-src 'none'", "style-src 'unsafe-inline'", "sandbox"].join("; ");

const nextConfig: NextConfig = {
  // A self-contained server bundle, so the production image carries no node_modules
  // (PROJECT_PLAN 13.3).
  output: "standalone",
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/uploads/:path*", headers: [{ key: "Content-Security-Policy", value: UPLOADS_CSP }] },
    ];
  },
};

export default nextConfig;
