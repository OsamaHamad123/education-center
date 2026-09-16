# Portal security review — phase P6

Reviewed on 2026-09-16, the day after P1–P3 shipped, against
`docs/PARENT-PORTAL-PLAN.md` phase P6 and the "Never do" list in `CLAUDE.md`.

Scope: everything a parent can reach — `/portal`, `/portal/print`, the sign-in and
sign-out actions, `portal_sessions`, and the three `app_portal_*` functions.

Written the same way as `docs/SECURITY-REVIEW.md`: **every finding says what an attacker
gets out of it**, because a finding nobody can exploit is a finding nobody will fix.
Everything below was found by reading the code and probing a real production build on
port 3100, not by a scanner. Where a finding was provable, it was proved before it was
fixed — finding 1 was reproduced in a live browser first.

## Summary

| #   | Finding                                                   | Severity | Status                      |
| --- | --------------------------------------------------------- | -------- | --------------------------- |
| 1   | Sign-out did not remove the cookie from the browser       | Medium   | Fixed — `portal-session`    |
| 2   | `portal_sessions` was readable by every staff query       | Medium   | Fixed — `drizzle/0010`      |
| 3   | Signing in again left the old session alive, and uncapped | Low      | Fixed — `portal.repository` |
| 4   | The sign-in action was the one mutation that skipped Zod  | Low      | Fixed — `portal-session`    |
| 5   | The portal wrote nothing to `audit_logs`                  | Low      | Fixed — `drizzle/0010`      |
| 6   | A grant and a column for a function nobody called         | Low      | Fixed — `drizzle/0010`      |
| 7   | Re-seeding did not end portal sessions                    | Low      | Fixed — `seed.ts`           |

Two things were reviewed, judged, and deliberately **not** changed. They are in
"Accepted, with the reason" below rather than buried: the shared rate limiter, which the
plan asked to split, and the phone salt travelling as a query parameter.

---

## 1. Sign-out did not remove the cookie from the browser — Medium

`signOutOfPortal` called `cookies().delete("ec.portal")`. That expires a cookie at the
**request's default path**, which is `/`. The portal's cookie is set with
`path: "/portal"`, and a cookie is keyed on `(name, domain, path)` — so the expiry landed
on a cookie that does not exist and the real one was never touched.

Proved before it was fixed. A real browser, signed in, then the خروج button:

```
BEFORE: [{"name":"ec.portal","value":"00edee40…","path":"/portal", …}]
AFTER:  [{"name":"ec.portal","value":"00edee40…","path":"/portal", …}]
```

Same value. Untouched.

**What an attacker gets.** On a shared phone — a family's one handset, a tutor's tablet,
the machine in the office — pressing خروج left the credential sitting in the browser for
thirty days. The next person to open `/portal` on that device was signed in as that
parent until the row expired.

It did not grant access _that day_, because `destroySession` deletes the row server-side
and `parentFor` then fails. But that is the whole of what sign-out was doing: **the
browser half of it had never worked**, and if the row delete ever failed — a connection
blip, nothing more — the parent stayed signed in while the screen told them they had
signed out.

**Fixed:** deleted with the same path it was set with, and an e2e test now asserts the
jar is empty afterwards. The path is a named constant used by both calls, because the
two drifting apart is exactly how this happened.

## 2. `portal_sessions` was readable by every staff query — Medium

The table has no `branch_id` and its rows belong to no tenant, so P1 reasoned about it by
analogy with `login_attempts` and gave it no RLS. That was the wrong comparison.
`login_attempts` holds a username somebody already typed into a public form.
`portal_sessions` holds a **live session token hash** and a parent's phone hash — and
`school_app` had a blanket `SELECT` on it.

**What an attacker gets.** Every staff-facing query in the product runs as `school_app`.
Any injection, any mistaken join, any future report that takes a table name from
somewhere it should not — and the whole portal's session table comes out with it: every
live token hash, every parent hash, for every family in the centre.

**Fixed** in `drizzle/0010`, and the fix is better than a policy keyed on a role, because
there is no role to key it on. The portal is the only part of this system that runs
**outside** `withTenant` — deliberately, because a parent is not staff. Every staff query
is inside one and therefore has `app.user_role` set. So:

```sql
CREATE POLICY portal_sessions_no_tenant ON portal_sessions
  FOR ALL USING (app_role() IS NULL) WITH CHECK (app_role() IS NULL);
```

`ENABLE` and `FORCE`, so it binds the owner too. Migrations and the seed set no role
either, so they still pass — the policy asks about the tenant context, not the login.

The effect is structural, not procedural: it is not that staff queries are not _supposed_
to read portal sessions. It is that they cannot. Four tests in
`tests/integration/tenant-isolation/portal-sessions.test.ts` hold the line — a super
admin sees zero rows, a branch admin sees zero rows, a staff insert is refused, and a
staff `DELETE FROM portal_sessions` evicts nobody.

## 3. Signing in again left the old session alive, and nothing capped them — Low

Each sign-in inserted a row and nothing removed the one before it. Sessions per phone
were unbounded and every one of them lived thirty days.

**What an attacker gets.** The credential is a student code printed on a timetable plus
four digits of a phone, so it _will_ be typed on more devices than the family owns: a
tutor's laptop, the office computer, a handset that was later sold. Each of those was a
thirty-day session that **nobody could end** — not the parent, not the centre. A parent
signing out on their own phone did nothing to the other five.

**Fixed:** a sign-in now ends the session that browser already had, and only the newest
five sessions per phone survive. Sign in on a sixth device and the oldest stops working.
That is both the eviction path the portal was missing and a ceiling on what a leaked code
is worth.

## 4. The sign-in action was the one mutation that skipped Zod — Low

`signInToPortal` took `raw: unknown` and **cast** it. Every other mutation in the product
goes through `createAction`, which parses with Zod before anything else; the portal
cannot use that wrapper, because it starts by requiring a staff session — so it was
written without the parsing too.

**What an attacker gets.** A 500, not data: `{ studentCode: 42 }` reaches
`normalizeStudentCode`, which calls `.replace` on a number and throws a `TypeError` out
of a server action. The lookup one module over, given the same input, returns a tidy
`Result`. Low, but it is a rule in `CLAUDE.md` and the sibling code already showed the
shape.

**Fixed:** the same `z.object({ studentCode, lastFour })` the lookup uses, and the same
single failure message as every other rejection.

## 5. The portal wrote nothing to `audit_logs` — Low

The anonymous lookup has written an audit row on every success since SECURITY-REVIEW
finding 4. The portal wrote none.

**What an attacker gets.** Nothing directly — this is what the _centre_ loses. The lookup
shows a **masked** name and is audited. The portal shows the child's full name, their
class, their branch and every absence with the teacher's note, and left no trace at all.
So of the two public doors, the newer and more revealing one was the one an administrator
could ask no questions about.

**Fixed:** `app_record_portal_audit` in `drizzle/0010`, the same narrow shape as the
lookup's — one fixed row, no free-text field, `action = 'login'` (a portal sign-in is a
login) with `entity = 'student.portal'` so the log never confuses the two doors. Only
successes are written; auditing failures would let anybody flood the record.

## 6. A grant and a column for a function nobody called — Low

`touchSession` was written in P1, exported, and never called once. `last_seen_at` was
therefore always equal to `created_at`, and the `UPDATE` grant that justified it was a
privilege the application never used.

**What an attacker gets.** A write privilege on a session table, available to anything
that reaches the app's connection. Small, but it is privilege with no purpose, which is
the definition of what least privilege removes.

**Fixed:** the function is gone, the column is dropped, and `UPDATE` is revoked. A column
nobody writes is not data, it is a claim. If P7 wants a real usage figure it should be
added deliberately, with the write it costs — `created_at` and `expires_at` already
answer "how many families signed in this week".

## 7. Re-seeding did not end portal sessions — Low

`portal_sessions` was in neither truncate list — not the seed's, not the integration
suite's. The seed recreates the same students with the same parent phones, so a session
created before a re-seed **kept working after it**, against freshly created rows.

**What an attacker gets.** Only relevant before handover, which is precisely when it
matters: the point of "أعد البذر" is to leave nothing of the test data behind, and a live
parent session is exactly the kind of thing meant to go.

**Fixed:** added to both lists.

---

## Accepted, with the reason

### The rate limiter stays shared — the plan asked to split it, and the plan was wrong

P6's first bullet says "its own rate limits, separate from the lookup's, on a separate
key". The build shares the lookup's limiter on the same two keys, and after reviewing it
that stays.

Sign-in and lookup are **the same guess against the same secret**. Two counters would
hand an attacker twice the budget for free, by alternating between two doors onto one
code. A separate key is only right when the credentials are different, and they are not —
that is the whole reason P1 could ship without a messaging provider.

The plan's bullet was written before the identity decision was made. It assumed an OTP,
which _would_ have been a different secret deserving its own counter. Recorded here so
the discrepancy reads as a decision rather than an oversight.

### An authenticated parent's reads are not rate-limited

Once signed in, `/portal?from=…&to=…` can be requested as often as the parent likes, and
each request runs two `SECURITY DEFINER` functions.

Accepted. The cost per request is bounded — the range is capped at two years, both
functions are index-driven, and getting a session at all costs a valid credential that is
already behind the shared limiter. A second limiter on the authenticated side would be a
second thing to maintain and the first thing to quietly stop being applied.

### The phone salt travels as a query parameter

`PORTAL_PHONE_SALT` is sent to Postgres as a **bind parameter** on every portal call.
Bind parameters do not appear in `pg_stat_statements`, but PostgreSQL logs them with
`log_statement = 'all'` and in slow-query detail.

**What that would cost.** The salt is what stops `parent_phone_hash` being reversible:
Egyptian mobile numbers are a space small enough to exhaust in seconds, so an unsalted
hash is a phone number. A log archive containing the salt turns the session table back
into a list of phone numbers.

Accepted as an operational control rather than a code change, and it is in the runbook:
**`log_statement` must not be `'all'` on the production server**, which is the default.

The structural alternative was considered and rejected for now: move the salt into a
table the definer functions read and the app never sends. It removes the parameter, but
it puts the salt in the database **next to `students.parent_phone` in plaintext** — so
against the realistic threat, a stolen dump, it buys nothing. Recorded so it is not
re-litigated from scratch.

---

## What held up

Checked and needed no change. Listed because "we looked" is part of the review.

- **The headers are real, and were measured on a production build**, not read off the
  config. `/portal` serves the full CSP with **no `'unsafe-eval'`**, `frame-ancestors
'none'`, HSTS, `nosniff`, and `Cache-Control: private, no-cache, no-store, max-age=0,
must-revalidate` — so a shared proxy on a school or office network cannot hold one
  child's page and hand it to the next parent. The `noindex, nofollow, nocache` meta is
  in the served HTML.
- **Enumeration.** A wrong code, wrong digits, an archived student and the feature being
  switched off all return the same string. The e2e suite compares two of them character
  for character rather than trusting the code path. A malformed code is refused before
  the database is touched, so it can neither be timed nor burn a limiter slot.
- **A student id from a URL grants nothing.** All three `app_portal_*` functions take the
  parent's phone hash and require it to match in the same `WHERE` clause. Tested at the
  SQL level as `school_app`, and through the screens: a foreign id falls back to the
  parent's own child on `/portal` and on `/portal/print`, and never shows another's.
- **`/portal/print` re-runs the whole query** rather than trusting its query string.
  Signed out, it is a 404 — verified against the running build, not asserted in a test
  alone.
- **A session names a phone, not a list of students.** Children are re-read from the
  phone on every request, so archiving a child, transferring them, or the centre
  switching the portal off all take effect on the next page load with no session to
  invalidate.
- **The kill switch works at the data layer.** `lookup_enabled = false` makes
  `app_portal_verify` return NULL and `app_portal_children` return `[]` — it closes the
  data path, not merely the door in front of it. This is what P7's rollout leans on.
- **The token is 256 bits of `randomBytes`, stored as a sha256.** The table cannot be
  used to sign in as anybody, and guessing is not a threat model.
- **No tenant context leaks into the portal.** Every portal query runs outside
  `withTenant`, so no RLS policy had to change for P1–P3 and none had to be re-audited.

## Session review — the questions P6 asked, answered

**How long?** Thirty days, absolute, not sliding. A parent types the code roughly once a
term. Nothing extends a session; it simply ends.

**How is it revoked?** Two levers, no screen for either, and both are now tested:

- **One family:** change the parent's phone on the student. The phone _is_ the identity,
  so every session behind the old number is orphaned immediately — including the one on
  the handset that was lost. This is the thing the office would do anyway.
- **The whole centre:** `lookup_enabled = false` in settings. One switch, no deploy.

Both are in the runbook under "A parent says somebody else can see their child's record".
A per-session revocation screen is P7 scope and is not worth building before anybody has
asked for it.

**What happens when a student leaves?** They disappear from the parent's portal on the
next request, and a sibling still on the books is unaffected. Tested.

**What happens when a student transfers branch?** The parent keeps reading their own
child and the screen names the new branch. A branch is the staff's boundary, not the
family's. Tested.

## What is still open

- **A per-session revocation screen** — P7, and only if the centre asks.
- **An OTP** — still the upgrade, still waiting on §16 question 8. It changes the
  credential and therefore _would_ deserve its own rate-limit key.
- **Nothing here has run on a real server.** Every measurement above was taken from a
  production build on this machine (§16 question 10 remains unanswered).
