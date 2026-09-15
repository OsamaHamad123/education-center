# PROGRESS

## Current phase

Phase 5 — Teachers — status: **done, verified in the running app**

| Acceptance criterion (section 14)           | Result                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| A branch admin cannot see unlinked teachers | ✅ RLS narrows them to their own links; verified by test and in the browser  |
| A branch admin has no rate-edit controls    | ✅ stronger than that — no rate ever reaches their page, at any width        |
| Rate history stored                         | ✅ the opening rate and every change; an idle save writes nothing            |
| Isolation tests for teachers                | ✅ 13 integration tests, including the by-phone link path                    |
| `pnpm typecheck && pnpm lint && pnpm test`  | ✅ 213 tests (153 unit + 60 integration)                                     |
| e2e                                         | ✅ 84 tests, desktop and mobile, passing twice in a row on the same database |

## Completed

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

| Date       | Decision                                                                                 | Reason                                                                                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-15 | Project lives at `F:\vscode projects\education-center`                                   | مجلد المشاريع المعتاد على جهاز المالك                                                                                                                                                                                                                                            |
| 2026-09-15 | Repository `education-center` is public on GitHub (OsamaHamad123)                        | اختيار المالك                                                                                                                                                                                                                                                                    |
| 2026-09-15 | Empty skeleton folders are kept in git via `.gitkeep`                                    | git لا يتتبع المجلدات الفارغة                                                                                                                                                                                                                                                    |
| 2026-09-15 | **TypeScript 6.0.3, not the latest 7.0.2**                                               | `typescript-eslint@8.70` requires `typescript <6.1.0`. TS 7 would cost us type-aware linting, and CLAUDE.md forbids disabling lint rules to make something pass. Revisit when typescript-eslint supports TS 7.                                                                   |
| 2026-09-15 | **ESLint 9.39.5, not the latest 10.10.0**                                                | `eslint-plugin-react@7.37.5` (pulled in by `eslint-config-next`) crashes on ESLint 10: `contextOrFilename.getFilename is not a function`. Revisit when that plugin ships ESLint 10 support.                                                                                      |
| 2026-09-15 | Architecture rules enforced with `no-restricted-imports`, not `eslint-plugin-boundaries` | PROJECT_PLAN Phase 0 allows either. The native rule expresses both constraints we need in ~15 lines with zero extra dependency, and its messages are Arabic. Verified by probe files that it errors on a cross-module deep import and on `react`/`@/shared/db` inside `domain/`. |
| 2026-09-15 | `better-auth` pinned to 1.7.4 and `vitest` to 5.0.0 (not 1.7.5 / 5.0.1)                  | pnpm 12's `minimumReleaseAge` supply-chain policy rejects packages published within the last day. Keeping the policy on is worth one patch version.                                                                                                                              |
| 2026-09-15 | `exactOptionalPropertyTypes` left **off**                                                | Vendored shadcn/Radix, sonner and react-day-picker props are not written for it; patching them on every `shadcn add` would be churn. All flags PROJECT_PLAN section 4 requires are on.                                                                                           |
| 2026-09-15 | Own `cn()` from `clsx` + `tailwind-merge` instead of shadcn 4's `cn` npm package         | The package is a three-line utility; `clsx` + `tailwind-merge` are already in the stack per section 4, and one less dependency is one less supply-chain surface.                                                                                                                 |
| 2026-09-15 | `/api/health` added in Phase 0 instead of Phase 10                                       | The e2e smoke test and the container healthcheck both need it, and it is six lines. Phase 10 still adds the DB ping.                                                                                                                                                             |
| 2026-09-15 | `pnpm test` passes with zero integration tests (`passWithNoTests`)                       | The integration project is empty until Phase 1 creates the schema and policies.                                                                                                                                                                                                  |

## Deviations from PROJECT_PLAN

- **Versions are not all "latest stable"** (section 4 versions policy): TypeScript and ESLint are one major
  behind, for the compatibility reasons in the decisions log. Everything else is latest stable, pinned exactly.
- `eslint-plugin-boundaries` was listed first in Phase 0 task 4; we used the sanctioned alternative
  `no-restricted-imports`.
- `/api/health` moved forward from Phase 10 to Phase 0.
- Phase 1's acceptance criteria are **not met**: they all require a live database.
- `branch_breaks` gained a unique constraint not listed in section 7.11 (see decisions log).

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
- **The seed produces 108 timetable slots, not the 288 a full grid would hold.** The seed assigns
  teachers by rotation and lets the `no_teacher_overlap` constraint reject clashes, so shared
  teachers thin the grid out. Fine as demo data; Phase 6 builds the real conflict-aware editor.
- Open questions 1–5 and 9 were answered with the plan's defaults (see decisions log). Questions
  6, 7, 8 and 10 remain open and affect Phases 8 and 10.
- Docker Desktop on this machine crashes at startup on stale AF_UNIX socket files
  (`%LOCALAPPDATA%/Docker/run/dockerInference`, `%LOCALAPPDATA%/docker-secrets-engine/engine.sock`).
  Windows cannot delete them; renaming the containing folder and restarting Docker fixes it. Those
  folders are now `*.broken-<timestamp>` and can be deleted once Docker is confirmed healthy.

## Next steps

Phase 6 — Timetable engine. The first phase with real algorithmic content: `compute-periods`
from the bell schedule and its breaks, a grid editor per class (Sat→Thu × periods), conflict
messages whose detail depends on the viewer's role, copying a timetable between classes, and
A4 print pages.

Carrying forward:

1. `no_teacher_overlap` already rejects a cross-branch clash in the DATABASE (verified in Phase 1).
   Phase 6 must catch it first and say _which_ class — but a branch admin may not learn the other
   branch's name, so the message has to differ by role (rule 10.4).
2. **Any new RLS helper that reads a table must be `SECURITY DEFINER` with a pinned `search_path`**,
   or it will recurse into the policy of whatever it reads.
3. Period times are computed once and STORED on each slot, so conflict checks stay a single
   index scan. Changing a bell schedule must recompute future slots and report what it breaks.

To bring a machine up from scratch:

```bash
pnpm install && cp .env.example .env
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm test
```

Seeded logins: `admin` / `admin_nsr` / `admin_obr` / `admin_giz` with `Password123!`;
teachers sign in with their phone and access code `123456`.
