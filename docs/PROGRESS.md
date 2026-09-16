# PROGRESS

## Current phase

Phase 9 — Teacher portal & public lookup — status: **done, verified in the running app**

| Acceptance criterion (section 14)                            | Result                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| The lookup cannot enumerate                                  | ✅ one message and one null for every failure; 14 integration tests, one per attack |
| Rate limiting works                                          | ✅ blocks on the 6th attempt, verified by hand against a server with the limiter ON |
| A teacher sees combined + per-branch data, own branches only | ✅ today, week, earnings and the lessons behind them — all scoped by RLS            |
| PDFs render Arabic with the Cairo font                       | ⛔ **not built** — deliberately deferred, see below                                 |
| `pnpm typecheck && pnpm lint && pnpm test`                   | ✅ 419 tests (290 unit + 129 integration)                                           |
| e2e                                                          | ✅ 200 tests, desktop and mobile, passing twice in a row against the same database  |

## Completed

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

## Next steps

Phase 10 — Hardening, performance, deployment. The last phase, and the one that decides
whether any of the above survives contact with a real server.

Carrying forward, in the order they bite:

1. **Per-account failed-attempt lockout** is still missing, and has been since Phase 2.
   Today a determined attacker gets 20 sign-in tries per 5 minutes per IP against a known
   username — and teacher access codes are six digits. This is the one outstanding item
   that is a genuine hole rather than a rough edge.
2. **404 and error pages are still the English Next.js defaults.** Every other string in
   the product is Arabic.
3. The deployment image must decide about **Chromium** — it settles both the optional PDF
   route and whether e2e can run in CI.
4. Open questions 4, 7, 8 and 10 from section 16 are still unanswered; 7 (academic terms)
   is the one that would change a schema, so ask before Phase 10 closes.
5. **The e2e suite leaves rows behind** in every seeded branch and has done since Phase 4.
   Either a reseed step before the suite, or a cleanup after it, before this is handed over.

To bring a machine up from scratch:

```bash
pnpm install && cp .env.example .env
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm test
```

Seeded logins: `admin` / `admin_nsr` / `admin_obr` / `admin_giz` with `Password123!`;
teachers sign in with their phone and access code `123456`.
