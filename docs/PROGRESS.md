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

### Phase D — done (2026-09-16)

- **`validate(schema, payload)`** runs the module's own Zod schema in the browser and
  returns the same `Result` shape `createAction` returns, so the six forms an admin uses
  all day check before the round trip and nothing about how they show the answer changed.
  `fieldErrorsOf` is now shared by both sides rather than written twice.
- **The register asks before you walk away from unsaved marks**, and `UnsavedGuard`
  covers closing the tab. A clean register does not nag — a guard that fires when there
  is nothing to lose is one people learn to click through.
- **Finding 8 was closed by a correction, not a change.** The seven `toast.error` calls
  looked inconsistent and are not: every one is a control with no field to attach a
  message to. The rule the code already follows, now written down: a failure that belongs
  to a field appears at the field; a failure from a control with no field is a toast.

Every finding in `docs/UX-AUDIT-2026-09.md` is closed.

**The loose end is gone too (2026-09-16):** `react-hook-form`, `@hookform/resolvers` and
`src/shared/ui/form.tsx` were removed. They had been in `package.json` and in the stack
list in CLAUDE.md since Phase 0, and in ten phases not one line ever imported them — so
the stack a reviewer reads described a library the product does not use. Both documents
now say what the forms actually do: plain `FormData` and a Zod schema run on both sides.
Build, 457 unit and integration tests and 289 e2e all pass without them.

## Product review — the first five (2026-09-16)

`docs/PRODUCT-REVIEW-2026-09.md` ranks ten suggestions from walking every screen. The
five that change a working day most are done.

- **`DateField`** replaced all fourteen `<input type="date">`. The native control renders
  in the BROWSER's locale, so the same screen read `09/16/2026` on one machine and
  `16/09/2026` on the next — and a payroll range read the wrong way round pays the wrong
  month. It is a text field with a calendar beside it; the value handed up is still ISO
  and only the display changed. `calendar.tsx` and `popover.tsx` had been in the repo
  unused since Phase 0, like `form.tsx`.
- **The dashboard leads with the work.** `openRegistersToday` returns today's unmarked
  periods as rows, each a link into its register, instead of the number 1 in a box. The
  attendance figure relabels itself to "حضور المُسجّل حتى الآن", because "100%" at ten in
  the morning was true and misleading at once.
- **The teacher's day** puts the time on its own line (it used to truncate, and the end
  time was what fell off), rings the lesson happening now, and makes an unmarked one
  amber.
- **The register's counters** are in the save bar at every width — they were
  `hidden sm:flex`, so on a phone the teacher was marking blind — and the button says
  what it will do: `حفظ الحضور — 3 غياب`.
- **Nine digit fields** open the number pad.

Note on the run: the first full e2e run after this landed showed nine failures, all
"toast not found" timing in the mutating specs; each passed in isolation and two
subsequent full runs were clean. Treated as load flakiness, not a regression — recorded
here rather than glossed over.

## Product review — the rest (2026-09-16)

- **The branch column** on the students list appears only when it distinguishes
  something; **the total** moved from the foot of the list to beside the title.
- **Payroll presets** — الشهر الماضي / الشهر الحالي — rather than a new default, because
  month-to-date is genuinely useful mid-month.
- **The class matrix** gained a غياب total stuck to the end of each row.
- **The timetable** shows a coloured dot per subject, hashed from the name so nothing
  needs configuring; red and amber are left out, they mean something else here.
- **The attendance board** rings the period happening now and makes an unmarked one
  amber. The "now" is computed in the QUERY: the board is a client component, and a clock
  read at hydration can disagree with the one read during the server render.
- **نفس رقم ولي الأمر** copies the phone into the WhatsApp field — eleven digits that were
  being typed twice.

**Two review points were wrong and are corrected in the document**: the students list
already had a total (at the foot), and the matrix name column was already sticky and
already had a legend. Both came from reading a screenshot rather than the markup.

Deliberately not done, with reasons in the document: a "بيانات ناقصة" filter (needs an
owner decision about required fields), clickable matrix cells (needs the edit window
applied per cell), a teacher's week on the timetable screen, a per-teacher payroll sheet,
and whole-row links on the students table.

## Parent portal — P1, P2, P3 (2026-09-16)

`docs/PARENT-PORTAL-PLAN.md` phases 1–3, built. `drizzle/0009_parent_portal.sql`,
`src/modules/portal/`, `/portal` and `/portal/print`.

**The identity is not the OTP the plan describes.** An OTP needs a messaging provider
that does not exist, so the portal signs in with the credential parents already have —
the student code and the last four digits — and adds the SESSION on top: typed once a
month instead of once a visit. When messaging is funded, `app_portal_verify` gains a
sibling and nothing else moves.

**No fourth role.** Three SECURITY DEFINER functions extend the pattern
`app_public_lookup` set in Phase 9. A parent gets no tenant context at all, so no RLS
policy had to change and none had to be re-audited.

**Every function re-verifies the parent.** A student id reaches the portal from a URL, so
each function takes the parent's phone hash too and requires the two to match in the same
WHERE clause. A tampered id returns nothing, the same way a wrong one does. Tested at the
SQL level as the app role, not only through the screens.

Two things the build caught that reading would not have:

- A client component importing the module's index dragged `postgres` into the browser
  bundle and broke `next build` outright. The sign-out button now imports the action file
  directly, and the comment says why.
- `/portal` was missing from `proxy.ts`'s public prefixes, so parents were being
  redirected to the STAFF login.

And one design mistake found by the suite: the portal shared the lookup's rate-limit
counters but not its `DISABLE_RATE_LIMIT` escape hatch, so under parallel load the portal
tests blocked each other. There is one guarded limiter now, exported from the lookup
module — two copies of a rate limiter is how one of them quietly stops being applied.

`admin-management.spec.ts` was also fixed to search before asserting: the password-change
spec creates a throwaway admin every run, and the seeded ones had long since fallen off
the first page.

**Test runs on this machine are load-sensitive.** With 6 workers the suite failed 9, then
2, then 9 tests — a different set each time, each passing in isolation, while a second
Next server ran on port 3000. At `--workers=2` it is 309 passed, 0 failed. Recorded rather
than glossed over.

## Parent portal — P6, hardening (2026-09-16)

`docs/PORTAL-REVIEW-2026-09.md`, seven findings, all fixed. `drizzle/0010`,
`portal-session.ts`, `portal.repository.ts`, `seed.ts`, and
`tests/integration/tenant-isolation/portal-sessions.test.ts`.

**Sign-out never removed the cookie.** `cookies().delete(name)` expires a cookie at the
request's default path, `/`; the portal's lives at `/portal`, and a cookie is keyed on
its path. Reproduced in a live browser before it was fixed — same value before and
after خروج. The server-side row delete was the only thing ending a session, so on a
shared phone the button left the credential in place for thirty days.

**`portal_sessions` was readable by every staff query.** P1 reasoned by analogy with
`login_attempts` and gave it no RLS; a username typed into a public form and a live
session token hash are not the same kind of secret. The policy in `drizzle/0010` admits
only statements with NO `app.user_role` — which is the portal and nothing else, because
every staff query runs inside `withTenant`. Staff cannot read it, rather than being
merely not supposed to.

Also fixed: a sign-in now ends the session that browser already had and only the newest
five per phone survive (nothing capped them before, and nobody could end them); the
sign-in action now parses with Zod like every other mutation; successful sign-ins write
an `audit_logs` row through `app_record_portal_audit`, because the door that shows the
UNMASKED name was the one with no trace; the dead `touchSession`, its column and its
UPDATE grant are gone; and `portal_sessions` is in both truncate lists, so a re-seed no
longer leaves live parent sessions behind.

**Two things were judged and deliberately left alone**, both recorded in the review
rather than buried. The plan's "separate rate-limit key" bullet is refused: sign-in and
lookup are the same guess against the same secret, and two counters would double an
attacker's budget. And the phone salt travels as a bind parameter, which is an accepted
risk with an operational control — `log_statement` must not be `'all'`, and that is now
in the runbook along with the two revocation levers.

**Measured, not assumed.** The headers were read off a production build on port 3100:
CSP with no `'unsafe-eval'`, and `Cache-Control: private, no-cache, no-store` — which is
the one that mattered, because a portal page is about one child and must never sit in a
shared proxy.

## Parent portal — P7, rollout (2026-09-16)

`drizzle/0011`, the settings and branches screens, `/print/portal-card/[id]`, and the
procedure in `docs/RUNBOOK.md` under "Rolling the parent portal out".

**The plan's rollout was not executable with the switches that existed.** There was one
— `lookup_enabled` — and it is shared with the anonymous lookup, so the only way to keep
the portal shut for most families was to shut the lookup every family already uses. Now
there are two: `center_settings.portal_enabled` (the master switch) and
`branches.portal_enabled` (which branches are in the rollout). **Both default to false.**
A feature that arrives switched on has not been rolled out, it has been released.

**The card.** Four to an A4 sheet, because a sheet that yields one card is a sheet nobody
prints twice. The URL is large, monospaced and LTR since a parent copies it off paper;
the branch's own number is on it in bold, under "لو لم تفتح معك". **The printer icon
appears only for a branch already opened** — a card is a promise that the URL works.

Three things fell out of building it that the plan had not asked for, all tested:

- The portal still requires `lookup_enabled`. It shows the UNMASKED name, so it must
  never be the door left open when the quieter one is shut.
- A deactivated branch closes the portal even if its switch was left on.
- A family with children at two branches, one open and one not, sees the open one — the
  case that proves the switch belongs on the branch rather than the centre.

**The seed is now a centre in the MIDDLE of a rollout**: master switch on, Nasr City
open, El Obour and Giza not. That is the state the product spends its first month in, and
it gives the e2e suite a real negative — a seeded El Obour parent with correct details
gets the identical refusal a wrong code gets, compared string to string.

**One operational trap, now in the runbook:** the card's URL comes from
`BETTER_AUTH_URL`. A wrong value is a wrong value on paper, in five hundred bags, and no
deploy fixes the ones already handed out.

## Parent messaging — P4a and P4b (2026-09-16)

`docs/MESSAGING-AND-FEES-PLAN.md`, the two phases that turned out not to be blocked.
`drizzle/0012`, `src/shared/lib/message-template.ts`, `/attendance/contact`.

**Templates (P4a).** Three, in centre settings, with a **live preview** beside each —
which is the feature, not the decoration: `renderTemplate` leaves an unknown placeholder
in the text rather than dropping it, so a misspelled `{النسبه}` is visible in the
preview instead of arriving at five hundred families as a blank gap. Rendering is a
SINGLE pass, so a value containing braces is never re-scanned.

**The record.** `contact` is a new audit action — not an 'update', because the log is a
thing you filter and spelling a contact as an edit would make it lie. One row per CHILD
rather than per message, since that is how it is read back: a sibling who shared a message
must still show as contacted. Both screens now say آخر تواصل or لم يتم التواصل من
قبل on every row — the half of P4a worth more than the wording.

**One message a day, per family (P4b).** `/attendance/contact`, grouped on the parent's
phone, which is the same identity the portal signs in with: a family IS a phone number
here. A child absent in three periods is one row naming three; two siblings are one row
with one message naming both children, not two copies of the same paragraph. The grouping
is pure and unit-tested.

Two things were added that the plan had not asked for and the screen is worse without: a
warning when registers are still unmarked, and a date control — half the time the office
rings the next morning about the day before, and the seed's own data proved it (the suite
had nothing to assert on "today").

**Nothing is sent by a machine.** The link is pre-filled and a person presses send. P4c
stays blocked on §16 q8, whose hardest question is who reads the replies.

Two bugs the work caught: the typechecker refused the new audit action until the log's
Arabic label existed (so it could never ship as a blank cell), and the first version of
the e2e removed an anchor's href and then looked the anchor up by ROLE — an anchor without
an href is not a link, so the locator silently moved to the next family's button.

## Fees and collection — P5 (2026-09-16)

The product's money phase. `drizzle/0013`–`0015`, `src/modules/fees/`, `/fees`,
`/fees/plans`, `/fees/[studentId]`, `/print/receipt/[id]`, and a balance card in the
portal. Plan: `docs/MESSAGING-AND-FEES-PLAN.md`.

**The six questions were answered by the defaults, on instruction.** Fee per class per
month; monthly periods; absence does NOT reduce the fee; discounts are an amount with a
required reason; branch admins collect and only the super admin sets prices (the price
list is the owner's, the cash desk is the branch's); receipts numbered per branch per
year from a locked counter. Every one is cheap to change except the first, which is in
the shape of `invoices`.

**Four decisions the plan had not made, all in `drizzle/0013`:**

- **`payments` is append-only, enforced by the GRANT.** `school_app` holds SELECT and
  INSERT and nothing else, so the application literally cannot edit or delete a payment.
  A mistake is a reversal row with a negative amount pointing at what it undoes. Tested
  as behaviour, not asserted in prose.
- **"Paid" is not a column.** It is `sum(payments) >= amount - discount`, computed in
  `domain/ledger.ts`. A stored status is a second source of truth and it drifts from the
  first the day somebody inserts a row by hand.
- **There is no "cancelled" state.** An invoice raised in error is discounted in full
  with a reason — same outcome, same audit trail, one fewer state.
- **Overpayment is refused, not flagged.** At a desk it is nearly always a typo (5000 for
  500), and a ledger that accepts it makes somebody chase a refund that should never have
  existed.

**One real hole, found by the isolation test rather than by reading.** A branch admin
could insert a payment carrying THEIR branch id against ANOTHER branch's invoice. RLS
checked the row's own branch and the foreign key checked the invoice exists — neither
asked whether the two agreed, and **foreign keys are not subject to RLS**, so an invoice
the attacker could not see was still a valid target. Not reachable through the
application (every write reads the invoice through RLS first) and the id is unguessable,
but this product's claim about isolation is that it is structural. Closed with a
composite foreign key on `(invoice_id, branch_id)` in `drizzle/0015`.

**The portal got two days at the end, deliberately.** `app_portal_balance` re-verifies
the parent in the same WHERE clause as every other portal function, caps at twelve
months, and returns no discount REASON — "منحة حالة" is the centre's note to itself. An
empty ledger shows NO card rather than a confident مستحق: 0.00.

**The seed is a centre mid-month:** last month settled, this month partly collected, so
the collection screen has something to work on the moment it is opened.

**Still to do, and now cheap:** payroll runs. The ledger the teacher half needs exists
and the pattern is set — a settled period per teacher, which also lets a settled month be
frozen against later attendance edits. That was the biggest functional gap the product
review found, and it is the obvious next piece of work.

## Payroll runs — paying the teachers (2026-09-17)

`docs/PRODUCT-REVIEW-2026-09.md` finding 2, which called this "the biggest functional
gap in the product that is not already written down as an open question". `drizzle/0016`,
`/payroll/runs`, and مدفوع on the teacher's own screen.

Payroll always computed the month correctly and printed it beautifully. Then the money
was handed over and the system learned nothing: next month nobody could answer "did we
settle September?" from the product, only from the paper it printed.

**The same shape as `payments`, deliberately** — it is the same kind of fact.
Append-only, enforced by the GRANT (`school_app` has SELECT and INSERT and nothing else),
with a reversal row instead of an edit.

**The freeze is the point.** Once a teacher's month is settled, that month's registers
stop being editable for their lessons — saving one, cancelling a session and restoring a
cancelled one all refuse. Reversing the settlement, which somebody signs their name to,
opens the month again. "Settled" is `sum(runs) > 0` rather than "a run exists", so a
payout recorded by mistake does not lock a register for ever.

**The amount is a snapshot, not a reference.** `amount_piasters` and `sessions_count` are
what the system computed at the moment the money changed hands, and the amount is
recomputed server-side rather than accepted from the client. If a register is corrected
afterwards the screen says تغيّر بعد الصرف — the discrepancy is the thing somebody has
to look at, and the only reason the count is stored at all.

**A teacher reads their own settlements and writes none.** The RLS policy has a second
arm for `app_teacher_id()`, which is what makes مدفوع possible without giving them a
branch. The settlements SCREEN is gated on `payroll.settle`, not `payroll.read`: reading
your own payslip and deciding it are not the same permission.

Two things the tests caught:

- The settlement dialog's confirm button and the row's trigger were both reachable as
  "صرف", so a single locator matched a closing dialog's disabled button and waited for
  ever. The trigger carries the teacher's name; the two are now told apart by that.
- A teacher hitting `/payroll/runs` is REDIRECTED to their own portal by the admin
  shell rather than 404'd. That is the better behaviour, so the test asserts it instead.

The freeze e2e runs in **Giza on the desktop project only, and reverses what it settles**:
the suite shares one database, and a settled month in Nasr City would freeze the
registers `attendance.spec.ts` is marking at the same moment.

## Roadmap items 1–3 (2026-09-17)

Built ahead of the deployment phases, at the owner's instruction. The roadmap's
recommendation is unchanged and recorded there: these are three more pieces of code that
have never met a real user, on a deployment that has not happened.

**1. The register survives a reload.** Marks are drafted to the device as they are
tapped, and OFFERED back on reload rather than applied — a register that silently
disagrees with the server is worse than one that lost a tap. Read with
`useSyncExternalStore`, not an effect: the server snapshot is null, so there is no
hydration mismatch and no cascading render for the hooks rule to refuse.

_The bug worth recording:_ the first version cleared the draft in the same effect that
wrote it. A fresh load starts CLEAN, so the effect ran on mount and wiped the draft it
existed to protect, before the banner could offer it. Found by the e2e, not by reading.
It is now cleared only on a confirmed save or on تجاهل.

**2. The owner's money screen.** `/reports/money`, read-only and cross-branch. `/fees`
and `/payroll/runs` both refuse "كافة الفروع" — correctly, a till belongs to one desk —
and the consequence was that the owner's own question had no screen at all. Outstanding
is summed per invoice, not from the totals, so an advance payment cannot cover somebody
else's arrears. A test asserts the screen has nothing to press.

**3. The accounting export.** Every receipt of the month it was received in, on `/fees`.
Reversals are negative lines with their own numbers, not omissions: a book that quietly
skips a cancelled receipt does not reconcile.

**Two till tests were narrowed to one browser.** Desktop and mobile both collecting from
the same first row race by construction — one pays the balance and the other finds no
تحصيل button. That is a fact about a till, not a bug in one.

**One run in three had a single failure I did not capture** before the next run
overwrote the results; the two runs after it were clean at 359 passed. Recorded rather
than smoothed over — this machine's load-sensitivity is already documented above.

## Academic terms — §16 question 7 (2026-09-17)

Roadmap item 4. `drizzle/0017`, the calendar on the settings screen, a term preset on
every report, and the public lookup's "الفصل" figure finally meaning a term.

**The question is answered by building the smallest version of it.** A term is a NAMED
DATE RANGE and nothing else: reports keep computing on `from` and `to`, and a term fills
them in. Nothing downstream learned a new concept, a shared report URL still carries
plain dates, and a centre that never adds a term sees no picker and no change at all.

**Why it was worth doing:** the product already SAID الفصل in one place and did not
mean it. The public lookup has shown a parent a "term" percentage since Phase 9 that was
really the last twelve months — `TERM_MONTHS = 12`, with a comment naming this question.
It now means the centre's term, and still answers twelve months where there is no
calendar.

**Two decisions that kept it small**, both recorded in the migration: the calendar is
**centre-wide**, because it comes from the ministry and three copies would be three
things to keep in step; and **fees stay monthly** — P5 answered that and built it, and a
term fee is a different feature rather than a consequence of naming the calendar.

**Terms cannot overlap**, enforced by a GiST exclusion constraint rather than by the
form: "the current term" has to have exactly one answer, and a calendar that can give two
is a calendar that will. The form checks it too, so the refusal arrives in Arabic.

**And a term can be DELETED**, which almost nothing else in this codebase can. Nothing is
stored against a term id — attendance, invoices and payslips are all stored against dates
— so removing a label mistyped in September changes no figure anywhere. An integration
test asserts exactly that: the attendance count is the same before and after.

## "Stop messaging me" — P4c step 2 (2026-09-17)

Roadmap item 5 is P4c, and P4c is blocked. **One step of it was not**, and it was the
one already overdue: `drizzle/0018`, `parent_message_optouts`.

**Why it could not wait.** Since P4a the office has been messaging parents by hand, and
a parent who said "stop" had nowhere to be recorded but somebody's memory. The opt-out
needs no provider, no budget and no answer to "who reads the replies".

**Why the rest WAS left.** Steps 1, 3, 5 and 6 of P4c are a queue, a job, a screen and a
cap for a sender that does not exist — and building the queue now would likely build the
wrong one: a WhatsApp outbox carries approved template ids and typed parameters, an SMS
outbox carries a string. The answer to §16 q8 is the first line of that code rather than
a detail to fill in afterwards.

**Three decisions, in the migration.** The table is keyed on a SALTED HASH of the phone,
not the phone: a branch admin already sees their own students' numbers, and a table of
every phone in the centre would hand them the other branches' too — hashed, a dump names
nobody. A ROW MEANS STOPPED, so the common case stores nothing and nothing had to be
back-filled. And the PARENT can set it themselves from the portal, through a
SECURITY DEFINER function that re-verifies them exactly as every other portal query does
— so a hash lifted from somewhere cannot be used to silence a family.

**It is the family's, not the student's.** One phone, one row, every sibling, every
branch. A per-student opt-out would mean a parent who said stop still being messaged
about their other child, and an integration test asserts the single row.

**No button rather than a disabled one** on both screens that message anybody: a greyed
out button is still pressed by somebody in a hurry.

Two test notes. The suite's own reset lists had to learn the new table — rows were
leaking between tests until they did. And the second register-draft e2e was racing its
own feature: it reloaded in the same tick as the tap, and the draft is written by an
effect. That is a race in the TEST, and the wait is now explicit rather than implied.

**Port 3100 stopped being bindable mid-session** — Windows had taken 3001–3100 and
3114–3213 into its excluded port ranges. The suite runs on 3300 now; nothing about the
product changed.

## The last two roadmap items (2026-09-17)

**§16 question 4 — travel time between branches — built.** `drizzle/0019`. A teacher in
two places at the same MOMENT has been refused since Phase 6; a teacher who finishes in
Nasr City at 10:30 and starts in El Obour at 10:35 never was. The allowance is a number
of minutes in centre settings because the answer differs by city, it is **0 by default**
so no existing centre changes, and it applies between BRANCHES only — two lessons in one
building are back to back by design.

The redaction was the interesting part: the refusal tells everybody the MINUTES and only
a super admin the branch. A number names nobody; a branch name would. The SQL function
from `drizzle/0005` gained a travel argument and now returns the gap, and its old
one-argument form was dropped in the same migration so there is never a moment when two
answers to that question exist.

**`/lookup` performance — measured, and the roadmap's own figure was wrong.** It said
150 KiB. On a production build the page pulls **1,353 KiB of JavaScript raw** across 19
chunks. That is what estimating instead of measuring buys, and it is now written down.

Two causes, found by reading the chunks: the entire `ar.ts` (55 KB of source, every
string in the product, shipped to a page whose only text is a form), and date-fns —
which `ar.ts` was pulling in through `time.ts` for ONE function, putting the timezone
machinery in the browser bundle of every page in the product.

**What was fixed:** `date-display.ts` now holds the library-free half — showing a date,
checking one, and naming its weekday are string and calendar arithmetic. `ar.ts` and the
public pages import that.

**What was not, deliberately:** the total did not move. Splitting `ar.ts` per screen
means touching every `ar.x.y` call site in the product, and the remainder is the Next and
React runtime. That is a hundred-file refactor for the byte count of a page nobody has
complained about, on a product that has still never been deployed. The measurement is
recorded so the decision can be made on a number rather than on my guess.

## Next steps

**See `docs/ROADMAP.md`** — written 2026-09-17, after payroll runs closed the last item
the product review had raised. Its recommendation in one line: **stop building and
deploy**, because nothing here has ever run outside one laptop and the product now holds
money. The list below is the handover half of that roadmap, unchanged:

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
