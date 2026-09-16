# Security review — Phase 10

Reviewed on 2026-09-16 against PROJECT_PLAN section 13.1 and the "Never do" list in
CLAUDE.md. Scope: tenant isolation, authentication, input validation, the public
lookup, logging, and the headers the app serves.

Everything below was found by reading the code and probing the running app, not by a
scanner. Each finding says what an attacker gets out of it, because a finding nobody
can exploit is a finding nobody will fix.

## Summary

| #   | Finding                                                | Severity | Status                  |
| --- | ------------------------------------------------------ | -------- | ----------------------- |
| 1   | No per-account lockout on failed sign-ins              | High     | Fixed — `drizzle/0007`  |
| 2   | No security headers at all                             | High     | Fixed — `next.config`   |
| 3   | Unexpected errors are logged whole, including row data | Medium   | Fixed — `create-action` |
| 4   | Public lookups were not written to `audit_logs`        | Medium   | Fixed                   |
| 5   | Three dynamic routes did not validate their UUID       | Low      | Fixed                   |
| 6   | 404 and error pages were the English Next.js defaults  | Low      | Fixed                   |
| 7   | `/api/health` did not touch the database               | Low      | Fixed                   |
| 8   | Cross-branch date-range reports had no covering index  | Low      | Fixed — `drizzle/0007`  |

## What held up

These were checked and needed no change. They are listed because "we looked" is part
of the review.

- **RLS is on every tenant table**, `ENABLE` **and** `FORCE`, and the application
  connects as `school_app` which is `NOBYPASSRLS`. Verified in the running database,
  not only in the migration.
- **Every tenant query runs inside `withTenant`.** The only direct `db` calls outside
  it are the public lookup's two SECURITY DEFINER functions and the centre's public
  name — both deliberate, both documented at the call site.
- **Every mutation goes through `createAction`**, which orders auth → permission →
  branch → Zod → tenant transaction → use case → audit, and rolls back on a failed
  `Result`.
- **Cross-branch reads fail closed.** A foreign id returns `NOT_FOUND`, never
  `FORBIDDEN`, so an id cannot confirm that it exists somewhere.
- **Secrets are env-only.** `.env.example` is committed with placeholders and no
  values; `LOOKUP_IP_SALT` is required to be at least 16 characters.
- **Nothing logs a phone number or a password.** The only `console.error` calls are on
  failure paths, and finding 3 below closes the one way row data could reach them.
- **The public lookup** was reviewed in Phase 9 with one test per attack scenario;
  nothing new was found here.

---

## 1. No per-account lockout on failed sign-ins — High

**Outstanding since Phase 2.** Better Auth counts every request to the sign-in
endpoint, not failures, so the per-IP budget was set to 20 requests per 5 minutes —
generous enough not to lock out a branch office sharing one address.

That leaves a known username brute-forceable at 20 guesses per 5 minutes per IP, which
is 5,760 a day from a single machine and unbounded from a botnet. **Teacher access
codes are six digits**, so a million-space is well within reach of a patient attacker.

**Fixed.** `drizzle/0007` adds `login_attempts`, and `recordFailedLogin` /
`assertNotLockedOut` gate the sign-in form: 10 failures against one username within 15
minutes locks that username for 15 minutes, regardless of source address. The counter
is keyed on the username alone, so a distributed attack is throttled exactly as a
single-host one is.

A successful sign-in clears the account's failures, so a parent-office user who
mistypes twice and then succeeds starts clean.

## 2. No security headers — High

`next.config.ts` was the generator's empty default. The app served no CSP, no
`X-Frame-Options`, no `Referrer-Policy` and no HSTS.

Concretely: the whole admin area could be framed by any site, so a clickjacking page
could put an invisible `/students/…/edit` over a game and harvest clicks; and the
default `Referer` would send the full path — including a student id — to any external
host a page linked to. The absence alerts link to `wa.me`, so that was not theoretical.

**Fixed.** Headers are set in `next.config.ts` for every route. See the file for what
each one is defending against; the notable choices are `frame-ancestors 'none'` (the
CSP form of `X-Frame-Options`, which also covers the `frame-src` case), a
`Referrer-Policy` of `strict-origin-when-cross-origin` so `wa.me` learns the origin and
nothing else, and HSTS only when `NODE_ENV=production` so local HTTP still works.

## 3. Unexpected errors are logged whole — Medium

`createAction` caught an unexpected throw and logged the error object. A Postgres
error carries a `detail` field, and for a unique violation that reads
`Key (phone)=(+201012345678) already exists.`

So a duplicate-phone crash wrote a parent's full number into the application log —
which CLAUDE.md forbids in as many words, and which is worse than it sounds because
logs are copied, shipped and retained far more casually than the database is.

**Fixed.** The handler now logs the error's _shape_ — its name, message, Postgres code
and constraint name — and never its `detail` or its parameters. That is everything
needed to diagnose a bug and nothing that identifies a person.

## 4. Public lookups were not audited — Medium

Rule 10.8 says lookups are logged "to `lookup_attempts` and `audit_logs` (hashed IP)".
Phase 9 wrote only `lookup_attempts`, which the rate limiter reads and prunes after
seven days.

The consequence is not a leak but a blind spot: `audit_logs` is what an administrator
reads when asking "who has been looking at this child's record", and lookups were
invisible there.

**Fixed.** A successful lookup now writes an audit row with the `lookup` action, the
student code as the entity id, and a hashed IP — the same hash the rate limiter uses.
Failures stay in `lookup_attempts` only: writing every wrong guess to the audit log
would let anyone flood it.

## 5. Dynamic routes did not validate their UUID — Low

`/students/[id]`, `/students/[id]/edit` and `/teachers/[id]` passed the raw path
segment to a query. A non-UUID segment reached Postgres, which refused to cast it, and
the throw surfaced as a 500.

Low severity — no data is exposed — but a 500 where a 404 belongs is both an error
page nobody wrote and a difference an attacker can measure: a malformed id behaved
differently from a well-formed one for a student in another branch.

**Fixed.** All three validate with `z.uuid()` and call `notFound()`, so every id the
viewer may not see behaves identically whether it is real, foreign or nonsense.

## 6. No Arabic 404 or error page — Low

Every string in the product is Arabic except the two pages a user is most likely to hit
when something has gone wrong, which were the English Next.js defaults.

**Fixed.** `not-found.tsx` and `error.tsx` are Arabic and RTL. The error page shows a
generic message and never the exception — a stack trace on screen is a map of the
application for whoever is probing it.

## 7. `/api/health` did not touch the database — Low

It returned `{status:"ok"}` unconditionally, so a container with a dead database
answered healthy and a load balancer would have kept sending traffic to it.

**Fixed.** It now runs `select 1` and answers 503 when that fails. It reports no
version, no hostname and no error text: a health endpoint is usually the most exposed
route on a deployment, and it should say whether to route traffic here, nothing more.

## 8. No covering index for cross-branch date-range reports — Low

`class_sessions` is indexed on `(branch_id, session_date)` and `(teacher_id,
session_date)`. Every branch-scoped query is covered, because RLS makes every query
branch-scoped — except the super admin's branch comparison, which filters on date
alone and therefore scanned the table.

At the seed's size the planner picks a sequential scan and is right to. At a few years
of sessions it would not be.

**Fixed.** `drizzle/0007` adds `(session_date, status)`, which serves both the
comparison and the payroll range scan.

---

## One loose thread

The CSP allows `'unsafe-inline'` for scripts, because Next.js emits an inline
bootstrap on every page. Tightening it needs a per-request nonce threaded through
`proxy.ts` and into the framework's script tags. `'unsafe-eval'` is **not** allowed,
which is the half that blocks most injected payloads; the inline allowance would only
matter to an attacker who could already inject markup, which nothing in the review
found a way to do.

## Measured

Lighthouse, mobile form factor, against a local production build of `/lookup` — the
one page an attacker reaches without a session:

| Category       | Score   |
| -------------- | ------- |
| Accessibility  | **100** |
| Best practices | **100** |
| Performance    | 85      |

Performance is below the ≥ 90 the plan asks for. The cause is a 4.0s Largest
Contentful Paint against a 0.9s First Contentful Paint, with the server answering in
20ms — so it is client-side, and `unused-javascript` reports 150 KiB of framework code
on a page that is one form.

`display: "optional"` on the Cairo font was tried as a fix and **measured as no
change** (4.0s → 4.1s), so it was reverted rather than left in for a benefit that did
not exist. The number is recorded here rather than explained away; see
docs/PROGRESS.md for what would actually move it.

## Still open, deliberately

- **Server-side PDF generation is not built** (Phase 9). It needs a Chromium binary in
  the deployment image; the `/print/*` pages give correct A4 output through the
  browser's own "save as PDF" today.
- **Travel time between branches is not modelled** — `no_teacher_overlap` is per
  minute, so a teacher can be booked in two branches at 09:30 and 10:30 with nothing to
  say they cannot cross Cairo in between. Explicitly out of scope for v1 (7.12).
- **The e2e suite leaves rows behind** in the seeded branches. An operational nuisance,
  not a vulnerability, and tracked in PROGRESS.
