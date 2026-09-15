# PROGRESS

## Current phase

Phase 1 — Database schema, migrations, RLS, seed — status: **BLOCKED — written but UNVERIFIED**

> ⛔ Every acceptance criterion of Phase 1 needs a running PostgreSQL, and Docker Desktop
> would not start on the dev machine (the `docker-desktop` WSL distro stays `Stopped`).
> The migrations have never been applied, the seed has never run, and the 30 integration
> tests have never executed. Nothing in Phase 1 may be treated as working until someone
> starts Docker Desktop and runs the commands under "Next steps".

## Completed

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

- [~] Phase 1 — schema, migrations, RLS, seed — **code complete, zero verification**:
  - 21 tables in `src/shared/db/schema/` covering PROJECT_PLAN section 7 in full
  - `drizzle/0000_initial_schema.sql` (generated) and `drizzle/0001_rls_and_constraints.sql`
    (hand-written: RLS policies, helper functions, grants, teacher-overlap exclusion constraint)
  - `src/shared/db/client.ts` (app role) and `with-tenant.ts`; `src/shared/auth/tenant-context.ts`
  - `src/shared/db/seed.ts` — 3 branches, 4 admins, 8 subjects, 6 teachers (2 shared across
    branches), 12 classes, 180 students, a full week's timetable and 2 weeks of attendance
  - `tests/integration/helpers/` (owner + app connections, `asTenant`, `ctxFor`, factories)
  - 30 integration tests: `tenant-isolation/branch-isolation.test.ts` and `constraints.test.ts`

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

- `pnpm` is not on the default `PATH` in every shell — it is installed at
  `C:\Users\OsamaHamad\AppData\Roaming\npm`. `corepack enable pnpm` failed with `EPERM` because
  `C:\Program Files\nodejs` is not user-writable; it would work from an elevated shell.
- Peer warnings remain from `eslint-config-next`'s plugins (`eslint-plugin-import`, `jsx-a11y`, `react`)
  and from `tsconfck` wanting TypeScript 5. Harmless today; they disappear as those packages catch up.
- **Docker Desktop will not start on this machine.** `wsl -l -v` shows `docker-desktop  Stopped`;
  launching `Docker Desktop.exe` starts `com.docker.backend` but the engine never comes up. It
  probably needs a GUI interaction (sign-in, licence, or a pending update).
- Open questions 1–5 and 9 were answered with the plan's defaults (see decisions log). Questions
  6, 7, 8 and 10 remain open and affect Phases 8 and 10.

## Next steps

**Verify Phase 1.** Start Docker Desktop, then:

```bash
pnpm db:up          # Postgres 16 + roles + school_test
pnpm db:migrate     # applies 0000 and 0001
pnpm db:seed        # demo data; prints login credentials
pnpm test           # 40 unit + 30 integration tests
```

Expect failures on the first run — none of this SQL has ever touched a database. Fix, re-run,
then move to Phase 2 (authentication, roles, tenant context, app shell).
