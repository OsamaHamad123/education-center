# PROGRESS

## Current phase

Phase 10 — Hardening, performance, deployment — status: **done**

| Acceptance criterion (section 14)           | Result                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Security review, findings fixed             | ✅ 8 findings in [`docs/SECURITY-REVIEW.md`](SECURITY-REVIEW.md), all fixed                          |
| A fresh server deploy from the README works | ⚠️ the stack builds and every step is written out, but it has NOT been run on a real VPS — see below |
| Backup + restore tested                     | ✅ encrypted dump → decrypt → restore → identical counts (380 / 223 / 3,924)                         |
| All tests green                             | ✅ 427 tests (298 unit + 129 integration) and 219 e2e, twice in a row                                |
| Lighthouse mobile ≥ 90                      | ⚠️ accessibility **100**, best practices **100**, performance **85** — measured, not met             |

## The two criteria that are not a tick

**The deploy has not been run on a real server.** Every piece exists and is written
out in the README — `Dockerfile` (standalone, non-root, healthchecked),
`docker-compose.prod.yml` (db → migrate → app → caddy → backup, in that order, with no
default passwords), the Caddyfile, and `pnpm create-super-admin`. What has not happened
is somebody typing those commands on a fresh VPS, because §16 question 10 (hosting) is
still unanswered and there is no server to type them on. The backup and restore halves
WERE exercised for real against the running database.

**Lighthouse performance is 85, not 90.** Accessibility and best practices are both 100.
The gap is a 4.0s Largest Contentful Paint against a 0.9s first paint with a 20ms server
response — client-side, and `unused-javascript` names 150 KiB of framework code on a page
that is one form. Switching the font to `display: "optional"` was tried and measured as
no change, so it was reverted. Moving this number means shipping less JavaScript to
`/lookup`, which is a real piece of work, not a setting.

## Completed

- [x] Phase 10 — hardening, performance and deployment:
  - [`docs/SECURITY-REVIEW.md`](SECURITY-REVIEW.md): a review of tenant isolation, auth,
    input validation, the lookup, logging and headers — 8 findings, each with what an
    attacker gets out of it, all fixed
  - **Per-account lockout** (`drizzle/0007`), the hole outstanding since Phase 2: 10
    failures against one username in 15 minutes locks it, keyed on the username so a
    distributed attack is throttled like a single-host one
  - Security headers, including `frame-ancestors 'none'` and a referrer policy that
    stops `wa.me` learning a student's id from the path
  - Error logs now carry an error's SHAPE, never a Postgres `detail` with a phone in it
  - Arabic 404 and error pages; `/api/health` pings the database and 503s when it cannot
  - `Dockerfile`, `docker-compose.prod.yml`, Caddy, encrypted backups with a verified
    restore drill, `pnpm create-super-admin`, and a CI e2e job that finally has a database
  - [`docs/RUNBOOK.md`](RUNBOOK.md) for whoever is on the phone at 3am
  - 8 new unit tests, 8 new integration tests, 10 new e2e specs
- [x] Phase 9 — teacher portal and the public lookup:
  - `drizzle/0006`: `app_public_lookup`, the one audited hole through RLS for a request
    with no session. It authorises itself (code AND last four digits, in one predicate),
    honours `lookup_enabled`, and returns an already-redacted document — the full name
    never leaves the database
  - `lookup/domain`: credential shaping (Arabic-Indic digits included), the masked-name
    format, and the two rate-limit windows with the reasoning for each
  - Public `/lookup` page: mobile-first, `noindex`, `force-dynamic`, and no URL that
    could carry a student's code
  - Teacher portal completed: earnings now list the lessons behind the total, and
    "تغيير كود الدخول" reuses the one password-change flow every role shares
  - 23 new unit tests, 14 new integration tests (one per attack scenario), 11 new e2e specs
- [x] Phase 8 — payroll and reports:
  - `payroll/domain/calculate-earnings`: the money rules, exactly the signature in 10.6 —
    completed sessions only, grouped by branch and track, integer piasters throughout
  - The report aggregates in **SQL**; `reconcileEarnings` runs both paths over the same
    rows and an integration test asserts they agree
  - Payroll screen with per-role filters, drill-down to the lessons behind a total,
    CSV export (pounds, at the very edge) and an A4 sheet with signature columns
  - `reports/domain/attendance-rates`: one definition of a percentage, used by four screens
  - Student attendance report, class matrix, absence alerts with click-to-chat wa.me links,
    and the super admin's branch comparison with charts
  - Dashboard: today's planned-versus-done gap for a branch, the comparison for «كافة الفروع»
  - `shared/lib/csv.ts` moved out of `students/domain` — CSV is a file format, not a student rule
  - 29 new unit tests, 16 new integration tests, 19 new e2e specs
- [x] Phase 7 — attendance and sessions:
  - `attendance/domain`: `edit-window` (who may write which day), `roster` (who is on the
    register, what a save writes, the status cycle, the summary), `session-plan`
    (the snapshot, the substitution, the cancellation rule)
  - Mobile-first marking screen: everyone defaults to حاضر, one tap makes a student غائب,
    a fixed save button, live counters, per-student notes, optimistic with safe rollback
  - Sessions are created **lazily on the first save**, snapshotting subject, times, track
    and the teacher's rate; the save is an upsert on `(session_id, student_id)`
  - Sessions log with filters; cancel with a reason, restore, substitute teacher
    (re-snapshotting the substitute's own rate), and extra sessions off the timetable
  - Teacher portal home: today's lessons across every branch, marking today only
  - A4 portrait attendance sheet with signature lines
  - 41 new unit tests, 18 new integration tests, 14 new e2e specs
- [x] Phase 6 — timetable engine:
  - `timetable/domain`: `compute-periods` (the single source of period times),
    `conflicts` (find + **redact** by viewer role), `recompute` (what a bell change does to
    the slots already drawn), `copy-timetable` (plan a copy, re-derive times, report skips)
  - Grid editor per class: Sat→Thu × periods on a desktop table, one card per day on a phone;
    cell dialog with subjects and only the teachers linked to that branch
  - Bell schedule per branch and track, with breaks and a live preview that runs the very same
    `computePeriods` the server will run
  - Saving the schedule recomputes every slot on that track in one transaction and reports what
    moved, what fell out of the day, and what collided
  - Copy a week from another class, re-deriving times from the target track's own bell
  - Teacher portal week view; A4 landscape print for a class and for a teacher
  - `drizzle/0005` adds `app_timetable_conflicts`, which redacts its own answer per role
  - 47 new unit tests, 18 new integration tests, 18 new e2e specs
- [x] Phase 5 — teachers:
  - `teachers/domain`: access-code generation that refuses weak draws; rate validation
    and change detection
  - Create a teacher (super admin) with per-track rates, an automatic login account and a
    one-time access code; edit rates into `teacher_rate_history`; reset the code;
    activate/deactivate (which also closes their login)
  - Link an existing teacher to a branch by phone (branch admin), unlink and relink
  - Teacher profile: branches, weekly load, recent sessions, and rate history for a super admin
  - `drizzle/0004` adds the narrow by-phone lookup the linking flow needs
  - 15 new unit tests, 13 new integration tests, 9 new e2e specs
- [x] Phase 4 — classes and students:
  - `students/domain`: enrollment transitions (`planClassChange`, `planBranchTransfer`,
    `planArchive`, `planRestore`) as pure functions returning a plan the use case applies;
    student-code format/parse; Arabic-aware duplicate detection; an RFC-4180 CSV reader/writer
  - `classes` module: CRUD with the two rules from 10.2
  - `students` module: server-paged list with trigram search and filters, profile with the
    enrollment timeline, create/edit, change class, transfer branch, archive, restore,
    CSV import with a per-row preview, CSV export
  - `drizzle/0002` lets a former branch read a transferred student; `drizzle/0003` fixes the
    policy recursion that introduced (see the decisions log)
  - 51 new unit tests, 10 new integration tests, 10 new e2e specs
- [x] Phase 3 — branches, users, subjects, center settings, audit viewer:
  - `branches` module: CRUD, activate/deactivate, code-lock rule, counts of students and admins
  - `users` module: branch admin accounts — create with a one-time temporary password,
    reset password, deactivate (both revoke every live session)
  - `subjects` module: CRUD, deactivation blocked while an active timetable still uses it
  - `settings` module: center settings and logo upload with an allowlist of types
  - `audit` module: server-paged viewer with branch / entity / action / date filters
  - Shared UI: `DataTable` (TanStack Table v9), `PageHeader`, `EmptyState`, `ConfirmDialog`
  - 9 new domain unit tests, 12 new e2e specs
- [x] Phase 2 — authentication, roles, tenant context, app shell:
  - Better Auth 1.7.4 (Drizzle adapter, username plugin, `disableSignUp`), `/api/auth/[...all]`
  - Login page with "إدارة" / "معلم" tabs; forced password-change page
  - `getSessionUser`, `resolveTenantContext`, `permissions.ts` (28 permissions), `createAction`,
    `requirePermission`
  - `src/proxy.ts` route protection (Next.js 16 renamed `middleware.ts` → `proxy.ts`)
  - Dashboard shell: permission-filtered sidebar, mobile sheet nav, BranchSwitcher,
    active-branch / read-only banners; teacher portal shell; logout
  - Login and logout auditing, with hashed IPs
  - 33 new unit tests (permission matrix, createAction pipeline) and 11 e2e specs
- [x] Repository scaffold — folder skeleton (Section 6), CLAUDE.md, docs/PROJECT_PLAN.md,
      docs/PROGRESS.md, ADR 0001, .gitignore, .env.example, README.md, GitHub repository created.
- [x] Phase 0 — project setup & clean code tooling:
  - Next.js 16.3.5 (App Router, `src/`, alias `@/*`) + React 19.2.8, pnpm 12.4.2
  - Strict `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
    `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`,
    `verbatimModuleSyntax`
  - shadcn/ui (RTL, Radix base) with 16 components in `src/shared/ui`
  - ESLint 9 flat config with type-aware rules + **architecture boundaries** (see Decisions)
  - Prettier + tailwind plugin, Husky (pre-commit: lint-staged + typecheck; commit-msg: commitlint)
  - `docker-compose.yml` + `docker/postgres/01-init.sh`: Postgres 16, `TZ=Africa/Cairo`,
    roles `school_owner` / `school_app` (both `NOBYPASSRLS`), databases `school` + `school_test`,
    extensions `pgcrypto`, `btree_gist`, `pg_trgm`
  - `src/shared/config/env.ts` (t3-env) and `constants.ts`; `.env.example`
  - Root layout `lang="ar" dir="rtl"`, Cairo font, Toaster, print `@page A4` styles
  - `src/shared/i18n/ar.ts` — the single source of Arabic UI text
  - `src/shared/lib/`: `result.ts`, `time.ts`, `money.ts`, `phone.ts`, `utils.ts` **+ 40 unit tests**
  - Vitest (unit + integration projects), Playwright (desktop + mobile), sample e2e smoke test
  - GitHub Actions CI: typecheck · lint · format · unit → integration (Postgres service) → build → e2e on main

- [x] Phase 1 — schema, migrations, RLS, seed:
  - 21 tables in `src/shared/db/schema/` covering PROJECT_PLAN section 7 in full
  - `drizzle/0000_initial_schema.sql` (generated) and `drizzle/0001_rls_and_constraints.sql`
    (hand-written: RLS policies, helper functions, grants, teacher-overlap exclusion constraint)
  - `src/shared/db/client.ts` (app role) and `with-tenant.ts`; `src/shared/auth/tenant-context.ts`
  - `src/shared/db/seed.ts` — 3 branches, 4 admins, 8 subjects, 6 teachers (2 shared across
    branches), 12 classes, 180 students, a full week's timetable and 2 weeks of attendance
  - `tests/integration/helpers/` (owner + app connections, `asTenant`, `ctxFor`, factories)
  - 37 integration tests: `tenant-isolation/branch-isolation.test.ts` and `constraints.test.ts`,
    plus `helpers/errors.ts`, which unwraps Drizzle's `Failed query:` wrapper so an assertion
    matches the actual Postgres `constraint_name` / `code` rather than any failure at all
  - Seeded database: 3 branches, 4 admin accounts, 6 teachers (2 shared), 12 classes,
    180 students, 108 timetable slots, 216 sessions, 3240 attendance records

## Decisions log

| Date       | Decision                                                                                    | Reason                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | Project lives at `F:\vscode projects\education-center`                                      | مجلد المشاريع المعتاد على جهاز المالك                                                                                                                                                                                                                                                                                         |
| 2026-09-15 | Repository `education-center` is public on GitHub (OsamaHamad123)                           | اختيار المالك                                                                                                                                                                                                                                                                                                                 |
| 2026-09-15 | Empty skeleton folders are kept in git via `.gitkeep`                                       | git لا يتتبع المجلدات الفارغة                                                                                                                                                                                                                                                                                                 |
| 2026-09-15 | **TypeScript 6.0.3, not the latest 7.0.2**                                                  | `typescript-eslint@8.70` requires `typescript <6.1.0`. TS 7 would cost us type-aware linting, and CLAUDE.md forbids disabling lint rules to make something pass. Revisit when typescript-eslint supports TS 7.                                                                                                                |
| 2026-09-15 | **ESLint 9.39.5, not the latest 10.10.0**                                                   | `eslint-plugin-react@7.37.5` (pulled in by `eslint-config-next`) crashes on ESLint 10: `contextOrFilename.getFilename is not a function`. Revisit when that plugin ships ESLint 10 support.                                                                                                                                   |
| 2026-09-15 | Architecture rules enforced with `no-restricted-imports`, not `eslint-plugin-boundaries`    | PROJECT_PLAN Phase 0 allows either. The native rule expresses both constraints we need in ~15 lines with zero extra dependency, and its messages are Arabic. Verified by probe files that it errors on a cross-module deep import and on `react`/`@/shared/db` inside `domain/`.                                              |
| 2026-09-15 | `better-auth` pinned to 1.7.4 and `vitest` to 5.0.0 (not 1.7.5 / 5.0.1)                     | pnpm 12's `minimumReleaseAge` supply-chain policy rejects packages published within the last day. Keeping the policy on is worth one patch version.                                                                                                                                                                           |
| 2026-09-15 | `exactOptionalPropertyTypes` left **off**                                                   | Vendored shadcn/Radix, sonner and react-day-picker props are not written for it; patching them on every `shadcn add` would be churn. All flags PROJECT_PLAN section 4 requires are on.                                                                                                                                        |
| 2026-09-15 | Own `cn()` from `clsx` + `tailwind-merge` instead of shadcn 4's `cn` npm package            | The package is a three-line utility; `clsx` + `tailwind-merge` are already in the stack per section 4, and one less dependency is one less supply-chain surface.                                                                                                                                                              |
| 2026-09-15 | `/api/health` added in Phase 0 instead of Phase 10                                          | The e2e smoke test and the container healthcheck both need it, and it is six lines. Phase 10 still adds the DB ping.                                                                                                                                                                                                          |
| 2026-09-15 | `pnpm test` passes with zero integration tests (`passWithNoTests`)                          | The integration project is empty until Phase 1 creates the schema and policies.                                                                                                                                                                                                                                               |
| 2026-09-16 | **The conflict message is redacted in SQL, not only in TypeScript** (`drizzle/0005`)        | A branch admin must be told a teacher is busy without learning whose class or which branch. Doing the redaction in the SECURITY DEFINER function means their server process never holds the other branch's data at all; `redactConflict` in `domain/conflicts.ts` is a second, independently tested layer over the same rule. |
| 2026-09-16 | A bell schedule that ends **exactly at 24:00 is rejected**                                  | `time` columns carry no date, so 24:00 wraps to `00:00` and `end_time > start_time` fails. Found by a unit test that originally asserted the opposite.                                                                                                                                                                        |
| 2026-09-16 | Clearing a cell **deactivates** the slot; it is never deleted                               | `class_sessions.timetable_slot_id` references it, and CLAUDE.md forbids hard deletes. Both the unique index and the exclusion constraint are `where (is_active)`, so the cell is genuinely free again.                                                                                                                        |
| 2026-09-16 | A recompute that would collide **deactivates that slot and reports it**                     | The alternative is letting `no_teacher_overlap` abort the whole settings save with a raw `23P01`. The admin gets a list of what fell out instead of an error in English.                                                                                                                                                      |
| 2026-09-16 | New permission `settings.read` (all three roles)                                            | Print headers need the centre's name and logo. `settings.manage` stays super-admin only because it carries policy — edit windows, alert thresholds, whether the public lookup is on.                                                                                                                                          |
| 2026-09-16 | **Marking a register for a FUTURE day is refused**, for every role                          | Rule 10.5 describes a window for editing PAST attendance and says nothing about the future. A register for a lesson that has not happened is not a late edit, it is fiction — so it is blocked and the rule is recorded here rather than invented silently.                                                                   |
| 2026-09-16 | The roster is the authority; a submitted student not on it is **dropped, not written**      | `attendance_records.branch_id` comes from the session, so RLS would happily accept a row for a student in another branch if the id were smuggled into the payload. `planAttendance` refuses it before the database is asked.                                                                                                  |
| 2026-09-16 | An extra session is checked for a **time** clash, not only a period-number clash            | The unique key is `(class, date, period)`, so two sessions that overlap on the clock under different period numbers would both be accepted. A class cannot be in two lessons at once either.                                                                                                                                  |
| 2026-09-16 | Restoring a cancelled session keeps its **original** rate                                   | The rate was snapshotted when the lesson ran. Re-deriving it on restore would quietly pay today's rate for last month's lesson.                                                                                                                                                                                               |
| 2026-09-16 | Absence alerts ignore students with fewer than **4 recorded sessions**                      | One absence out of one session is 100%, and an alert list topped by arithmetic accidents is one nobody reads. Not in rule 10.7; stated as a named constant so it is a visible policy rather than a magic number.                                                                                                              |
| 2026-09-16 | `late` and `excused` count as ATTENDING; only `absent` counts against a student             | Rule 10.7 does not say which statuses count. A centre that counted an excused absence against a child would be answering the wrong question to the parent asking it. `attendanceRate` and `absenceRate` are exact complements, so no two screens can disagree.                                                                |
| 2026-09-16 | The class matrix shows the **worst** status of a day, not one cell per period               | A day holds several periods. The question the grid answers is "which days did this student miss", and a row of six sub-cells per day fits on no screen.                                                                                                                                                                       |
| 2026-09-16 | The payroll CSV is a **blob**, not a download URL                                           | It lists what people are paid. A URL is something that can be forwarded, cached or logged; the bytes are already in hand.                                                                                                                                                                                                     |
| 2026-09-16 | **Open question 3 answered by the owner: the lookup shows the first name + family INITIAL** | Narrower than the plan's default of "first two names". The database returns the two parts separately, so the full name never reaches the application and no UI bug can leak it by forgetting to mask.                                                                                                                         |
| 2026-09-16 | An **archived** student is not publicly reachable                                           | Rule 10.8 does not say. A departed student's record should stop being a live public answer the moment they stop attending; a parent who needs the history can ask the branch.                                                                                                                                                 |
| 2026-09-16 | A **blocked** lookup is not recorded as an attempt                                          | Otherwise a caller who is already shut out can keep extending their own block, and — worse — can push somebody else's student code over its hourly limit by hammering it.                                                                                                                                                     |
| 2026-09-16 | `DISABLE_RATE_LIMIT=1` now silences the LOOKUP limiter too, not just sign-in                | The whole e2e suite runs from one address, so a per-IP budget meant for the internet blocks the suite against itself after five deliberately-wrong lookups. Never set in production.                                                                                                                                          |
| 2026-09-16 | The lookup rate limiter also honours `DISABLE_RATE_LIMIT`, and CI sets it                   | The e2e suite runs from one address; a per-IP budget meant for the internet blocks it against itself. Never set in production.                                                                                                                                                                                                |
| 2026-09-16 | `display: "optional"` on the Cairo font was tried and **reverted**                          | Measured as no change to the Largest Contentful Paint (4.0s → 4.1s). Keeping it would have changed how the product looks on a first visit for a benefit that did not exist.                                                                                                                                                   |
| 2026-09-16 | A failed backup encryption DELETES the dump instead of keeping it in plaintext              | `postgres:16-alpine` ships without openssl, so the original fallback would have written plaintext dumps forever while logging a warning nobody reads. Found by running the script for real.                                                                                                                                   |

## Deviations from PROJECT_PLAN

- **Versions are not all "latest stable"** (section 4 versions policy): TypeScript and ESLint are one major
  behind, for the compatibility reasons in the decisions log. Everything else is latest stable, pinned exactly.
- `eslint-plugin-boundaries` was listed first in Phase 0 task 4; we used the sanctioned alternative
  `no-restricted-imports`.
- `/api/health` moved forward from Phase 10 to Phase 0.
- Phase 1's acceptance criteria are **not met**: they all require a live database.
- `branch_breaks` gained a unique constraint not listed in section 7.11 (see decisions log).
- **The teacher marking route is `/teacher/attendance/[slotId]`, not `[sessionId]`** (section 11).
  Sessions are created lazily on the first save, so an unmarked period has no id to link to; the
  timetable slot is the only stable handle a teacher can arrive with. The date is not in the URL
  either — a teacher marks today, and only today.

## Known issues / TODO

- **The e2e suite leaves throwaway rows behind.** Mutating tests enrol their own student
  (and Phase 3's rename test creates its own branch) so the suite is repeatable — verified by
  running it twice — but those students stay in the seeded branches. Reseed periodically.
- **`pnpm db:seed` did not reset `login_attempts`.** The truncate list was written in
  Phase 1 and never learned about the table Phase 10 added, so a lockout counter outlived a
  reseed that claims to rebuild from scratch. Harmless in practice — the rows expire in 15
  minutes — but it was the one table that could refuse a sign-in on a freshly seeded
  database. Added to the list on 2026-09-16, next to `lookup_attempts`.
- **The e2e suite only works on the port `BETTER_AUTH_URL` names.** Moving it to
  another port (`PORT=3100`) to get out of the way of a running `pnpm dev` makes
  sign-OUT fail with `Invalid origin` and a 403, while sign-in still succeeds — so the
  suite reports a broken logout and nothing else. Set both:
  `PORT=3100 BETTER_AUTH_URL=http://localhost:3100 pnpm test:e2e`.
- **The old e2e rename test creates a branch and leaves it deactivated.** Running the suite many
  times against one database slowly accumulates inactive `فرع اختبار XXXXX` rows. Harmless, but
  worth a cleanup step when the suite grows.

- `pnpm` is not on the default `PATH` in every shell — it is installed at
  `C:\Users\OsamaHamad\AppData\Roaming\npm`. `corepack enable pnpm` failed with `EPERM` because
  `C:\Program Files\nodejs` is not user-writable; it would work from an elevated shell.
- Peer warnings remain from `eslint-config-next`'s plugins (`eslint-plugin-import`, `jsx-a11y`, `react`)
  and from `tsconfck` wanting TypeScript 5. Harmless today; they disappear as those packages catch up.
- **Per-account failure lockout is not implemented** (see the rate-limit decision above). Today a
  determined attacker gets 20 tries per 5 minutes per IP against a known username. Worth adding a
  failed-attempt counter keyed on the username before go-live, especially for 6-digit teacher codes.
- **404 and error pages are still the English Next.js defaults.** Phase 10 replaces them.
- **Server-side PDF generation is NOT built** (Phase 9 task list marks it "optional";
  its acceptance line is therefore unmet and shown as ⛔ above). A `/api/pdf?path=` route
  driving Playwright needs a Chromium binary and its font stack inside the deployment
  image, which is a Phase 10 decision, not a Phase 9 one — and shipping a route that
  throws in production would be worse than not shipping it. The `/print/*` pages already
  produce correct A4 output through the browser's own "save as PDF", with Cairo embedded
  by `next/font`; every one of them is verified in the print-media tests.
- **The lookup limiter's end-to-end wiring is not covered by e2e**, because the suite
  disables it (see the decision above). It is covered by unit tests on the decision and
  integration tests on the counters, and the wiring was verified by hand against a server
  started without the flag: five wrong lookups are answered generically, the sixth returns
  "محاولات كثيرة. حاول بعد 15 دقيقة." and is NOT recorded.
- **The seed's demo payroll is small but correct.** Two weeks of sessions across three branches
  come to 29,450 ج.م; a verification query, the comparison screen and the printed sheet all agree
  on it, branch by branch. Reseed for a longer period before demonstrating a term's payroll.
- **`recharts` renders client-side only.** The comparison charts are in a `"use client"` component
  and do not appear in the print sheet, which is deliberate — the table beside them is the record,
  and a chart rasterised at print resolution is not worth the page.
- **A class's register can be long.** The e2e suite has been enrolling students into the seeded
  classes since Phase 4, so أدبي 1 - بنين in مدينة نصر now has well over a hundred. The screen
  handles it, but the demo data no longer looks like a real class — reseed before showing it.
- **The e2e suite is CPU-bound on sign-in.** Eight browsers each running a scrypt hash blew the
  default 5-second navigation assertion; a single sign-in against an idle server takes ~0.2s.
  The helpers now allow 20 seconds. The real fix is Playwright `storageState` — sign in once per
  role and reuse the cookie — which would also cut the suite's runtime roughly in half.
- **Two lists had outgrown their first page** and their e2e tests were asserting on row one:
  teachers (Phase 5) and branches (Phase 3). Both now search before asserting. This will recur for
  every list the suite writes to; the underlying cause is still the throwaway rows below.
- **Copying a week between two classes on the SAME track in one branch can never create a
  slot.** The copy carries the teacher, and that teacher is by definition already in the source
  class at that exact minute, so every candidate collides. It works across tracks (different
  bells) and into a branch whose teachers are free — verified by hand: a literary period 5
  (12:20–13:05) copied into a scientific class became that track's own period 5 (11:20–12:05).
  The plan (section 14, Phase 6) says "copy timetable from another class" without saying whether
  the teacher comes along. Copying the SUBJECT skeleton alone would always succeed and is probably
  the more useful action, but `timetable_slots.teacher_id` is `not null`, so it is not
  representable without a schema change. **Open question for the owner** — not invented either way.
- **`no_teacher_overlap` is per-minute, not per-journey.** A teacher can be scheduled in مدينة نصر
  at 09:30 and in الجيزة at 09:30 with no overlap and therefore no complaint, even though nobody
  can cross Cairo in nothing. Travel time is explicitly out of scope for v1 (section 7.12).
- **The e2e "add and clear a lesson" test leaves a deactivated slot per run.** Correct behaviour —
  clearing archives the row — but they accumulate. Same cleanup story as the throwaway students.
- **Playwright's `fill()` does not work on `<input type="time">` in this app.** It sets the DOM
  value without tripping React's value tracker, so `onChange` never fires and the field silently
  disagrees with the state behind it; the assertion then passes while the preview stays put. The
  timetable spec types the digits instead (`setTime`). The component itself is fine — verified in
  the browser with the native value setter.
- **The seed produces 108 timetable slots, not the 288 a full grid would hold.** The seed assigns
  teachers by rotation and lets the `no_teacher_overlap` constraint reject clashes, so shared
  teachers thin the grid out. Fine as demo data — but it also means the three seeded teachers are
  effectively fully booked, which is why a copy between seeded classes reports nothing but skips.
- Open questions 1–5 and 9 were answered with the plan's defaults (see decisions log). Questions
  6, 7, 8 and 10 remain open and affect Phases 8 and 10.
- Docker Desktop on this machine crashes at startup on stale AF_UNIX socket files
  (`%LOCALAPPDATA%/Docker/run/dockerInference`, `%LOCALAPPDATA%/docker-secrets-engine/engine.sock`).
  Windows cannot delete them; renaming the containing folder and restarting Docker fixes it. Those
  folders are now `*.broken-<timestamp>` and can be deleted once Docker is confirmed healthy.

## Audit — September 2026

A second review, screen by screen, asking what each page does with input it did not
expect. Eleven findings, one High, in `docs/AUDIT-2026-09.md`, grouped into five phases
by area. Branch isolation, RLS and the teacher redirects were pushed at and held; what
did not hold is query-string validation on the report, payroll and attendance screens,
and the split between changing a password and clearing the flag that forced it.

### Phase A — done (2026-09-16)

Findings 3, 4 and 5 are fixed, and a twelfth was found while fixing the third.

- **Changing a password and clearing `must_change_password` are one server action.**
  They were two calls the browser made in sequence, and the second verified nothing.
- **The length floor is enforced on the server**, and is now a number per role rather
  than one inherited from the six-digit teacher access code: `PASSWORD_POLICY` in
  `shared/config/constants.ts`.
- **`safeRedirectPath` resolves `?next=` against the origin** instead of checking that
  it starts with a slash, because `//evil.com` does.
- **Finding 12:** the flag could never be cleared by a branch admin at all. The write
  ran inside `withTenant`, and `user_update` does not admit `branch_admin` — RLS
  filtered it to zero rows, silently, so a new admin changed their password and was
  sent straight back to the same form. There was no test for that screen; writing one
  is what found it. The flag is now cleared on the no-role path Better Auth's own
  writes use, rather than by widening the policy — see the comment at the call site
  for why widening was the wrong half to change.

`tests/e2e/password-change.spec.ts` walks a brand-new admin from a temporary password
to a working account, and asserts at every refusal that it is the server refusing.

### Phase B — done (2026-09-16)

Findings 1 and 2, on the report and payroll screens.

- **`shared/lib/url-filters.ts`** parses what arrives in a query string: `dateParam`,
  `uuidParam`, `readDateRange`. Every field has `.catch()`, so an unusable value is
  treated as an absent one and the screen renders its default range.
- **The date check is `isIsoDate`, not a regex.** `2026-02-31` and `2026-13-01` both
  match `\d{4}-\d{2}-\d{2}` and both make Postgres raise — which is how a shape check
  would have left half the bug in place.
- **The QUERIES parse, not the pages.** `/print/payroll` passes its whole query string
  through untouched, so fixing `getPayrollReport` fixed the print sheet too. One place
  decides what `?from=abc` means.
- **Half a range still survives.** `?to=2026-09-10` with no `from` has always been a
  real request; only the unusable half falls back.
- **A shape check is not an ownership check.** A well-formed id from another branch is
  still a 404, and `report-filters.spec.ts` asserts it — a fix for a crash must not
  quietly widen what a viewer can see.

### Phase C — done (2026-09-16)

The rest of findings 1 and 2, on the screens used every day.

- **The board opens on today** when its date is unusable, and the sessions log falls
  back to its fortnight. `?date=not-a-date` used to reach `isoDayOfWeek`, which throws
  before a query is even built.
- **`/attendance/mark` answers 404 instead**, and that difference is the point: it is
  the screen you WRITE on, and silently opening a register for a day nobody asked for
  is worse than an error page, because the next tap marks it.
- **The class redirect no longer carries the bad date.** An unknown class redirects to
  the first one, and that URL was built from the raw `date`, so the crash just moved to
  the next request.
- The `status` filter on the sessions log already dropped a typo rather than refusing
  it, with the reasoning written at the call site — "it is a URL, and a typo in one
  should not be an error page". The dates and the ids now agree with it.

### Phase D — done (2026-09-16)

Findings 6, 7 and 11, and a thirteenth found while testing the sixth.

- **`toCsvField` neutralises a formula**, with one exception written into the rule: a
  sign followed only by digits is left alone, because a phone is stored as
  `+201012345678` and that is arithmetic. Escaping it would have put an apostrophe in
  front of every phone in every export — a regression dressed as a fix.
- **`/uploads/*` gets a second CSP**, not a replacement. Two CSP headers are enforced as
  an intersection, so it can only narrow what the page-level policy allows. SVG stays in
  the logo allowlist; a script inside one is now inert.
- **Finding 13: the export had no BOM by the time it reached the browser.** `toCsv`
  writes one and its unit test passes; a Next.js server action does not return it. So
  every exported register was opening in Excel as mojibake — exactly what the BOM was
  added to prevent. Isolated by downloading a blob built inside the page, which kept its
  BOM. `ensureBom` now runs where the file is written rather than where it is generated.
- The import's size error said the **logo** was too large.

The lesson worth keeping: the unit test asserted on the function and passed for months.
The bug was in the wire, and only a test that read the saved bytes could see it.

### Phase E — done (2026-09-16)

Findings 8, 9 and 10, and a fourteenth found while reading the print routes.

- **`/print/payroll` checks the role.** Not a blanket teacher redirect on the layout,
  which is what the audit first suggested and would have been wrong: a teacher prints
  their own week and the register they just marked, so two doors that are meant to be
  open would have closed. The layout did gain `mustChangePassword`, which it was missing
  while both other shells had it.
- **Finding 14: the attendance sheet could not be printed once the log scrolled past
  it.** The page found its session by scanning `getSessionLog` over a century — capped
  at 300 rows, newest first. A branch runs roughly four hundred sessions a week, so the
  button worked for about four days of history and then answered 404, which is also what
  it answers for another branch's session. The seed has 103 sessions in its largest
  branch, which is why the suite never saw it. Now looked up by id, with an integration
  test that builds 301 sessions.
- **`describeError` is shared**, so the two functions closest to authentication stop
  logging the error object whole.
- **`likeTerm` escapes the search.** `%` used to return the whole register.

Every finding in `docs/AUDIT-2026-09.md` is closed.

## UX and state management audit — September 2026

Ten findings in `docs/UX-AUDIT-2026-09.md`, four phases.

### Phase A — done (2026-09-16)

- **`useAction` replaces `useTransition`** in all 22 mutating components. They handled a
  refused `Result` and not a request that never arrived, and React re-throws that into
  the app-wide error boundary — so a dropped save replaced the whole screen and
  everything typed into it. Verified by aborting a save in flight before and after.
- Adoption is one line per component and no action body changed, which is why it was
  worth doing as a hook rather than wrapping 28 call sites.
- **The error page stopped asking for a reference number it does not have.** Only a
  server error carries a digest; every client-side one landed on a screen telling the
  user to report "الرقم أدناه" with no number on it.

### Phase B — done (2026-09-16)

- **A spinner on the nav item that was tapped**, via `useLinkStatus`.
- **`useNavPending` on all seven filter components.** The push runs in a transition, so
  the controls disable as a group and the current screen stays up while the next is
  built. The attendance date stepper can no longer be tapped twice.
- **The mobile menu stays open until the route changes**, keyed by the pathname rather
  than closed from an effect — otherwise there was nowhere for the feedback to appear on
  the device most of the teachers use.

**A route-group `loading.tsx` was written first and reverted.** It makes Next flush the
shell before the page decides, so `notFound()` arrives inside a response already sent as
**200** — eight existing tests caught it. Returning 200 for another branch's student
would undo what the security review leans on hardest. `loading-feedback.spec.ts` now
asserts the 404 as well as the spinner, so it cannot come back by accident.

Also corrected in the audit: the four `<Suspense>` boundaries were called dead code, and
they are not. They wrap components that call `useSearchParams`. They cannot double as
loading states, but they were not removed.

### Phase C — done (2026-09-16)

`useNavPending` now does `router.replace(href, { scroll: false })`, so three taps on the
attendance date stepper cost one press of the back button to leave, not three, and a
filter changed from the bottom of a register stays where it was.

Pagination was deliberately left on `push`: those are real `<Link>`s and walking back
through pages is what a link is for. The line drawn is that a control which changes what
a list SHOWS replaces, and a link that moves you through it pushes.

Phase D is open.

## Next steps

All ten phases are done. What is left is not a phase — it is the handover:

1. **Answer §16 question 10 (hosting)** and run the deploy on a real server. Everything
   is written out in the README; nobody has typed it on a VPS yet.
2. **Do the restore drill on that server** before it holds real data, and set
   `BACKUP_PASSPHRASE` — without it the dumps are plaintext and the log says so daily.
3. **Copy backups off the box.** The container writes to a local volume only, which is
   not a backup of the machine it lives on.
4. ~~**Reseed before handing it over.**~~ **Done 2026-09-16.** The database had grown to
   476 students, 213 teachers and 79 branches against a seed of 180 / 6 / 3 — the e2e
   suite's residue since Phase 4. `pnpm db:seed` rebuilt it, and `school_app` was
   re-checked as `rolbypassrls = f` afterwards. **Do it again after the next e2e run**,
   because every run adds to it.
5. **§16 questions 4, 7 and 8 are still unanswered.** Question 7 (academic terms) is the
   only one that would change the schema — reports work on date ranges today, which was
   the plan's own default.
6. **Performance on `/lookup`** if the 90 matters: 150 KiB of framework JavaScript for
   one form is the whole gap.

To bring a machine up from scratch:

```bash
pnpm install && cp .env.example .env
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm test
```

Seeded logins: `admin` / `admin_nsr` / `admin_obr` / `admin_giz` with `Password123!`;
teachers sign in with their phone and access code `123456`.
