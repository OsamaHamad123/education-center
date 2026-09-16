# CLAUDE.md — Multi-Branch Education Center System

> This file is read automatically by Claude Code at the start of every session.
> The full specification lives in `docs/PROJECT_PLAN.md`. Progress is tracked in `docs/PROGRESS.md`.

## What we are building

A lightweight, mobile-first, Arabic (RTL) web system for an education center with multiple branches
(e.g. Nasr City, El Obour, Giza). It manages branches, classes (شُعب), students, teachers, weekly
timetables, daily attendance, teacher session counts and payroll, printable reports, a teacher portal
and a public parent/student lookup page.

## Tech stack (do not change without asking)

- Next.js (App Router, latest stable) + React + TypeScript (strict)
- PostgreSQL 16 + Drizzle ORM + drizzle-kit migrations
- Better Auth (Drizzle adapter, username plugin) for authentication
- Zod for all validation (shared between client and server)
- Tailwind CSS + shadcn/ui (RTL), font: Cairo via next/font
- TanStack Table for data tables; forms are plain `FormData` + a Zod schema run on both
  sides (`shared/lib/validate.ts`). React Hook Form was in this list and in
  `package.json` for ten phases without a single import, and was removed.
- date-fns + @date-fns/tz, timezone ALWAYS `Africa/Cairo`
- Vitest (unit + integration against real Postgres), Playwright (e2e)
- pnpm, Docker Compose for local DB

If a library API looks different from what you remember, check the official docs before writing code.
Never downgrade or add a new major dependency without asking.

## Commands

```bash
pnpm dev            # run app
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm format         # prettier
pnpm test           # vitest (unit + integration)
pnpm test:e2e       # playwright
pnpm db:up          # docker compose up -d db
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # apply migrations
pnpm db:seed        # seed demo data
pnpm db:studio      # drizzle studio
```

## Architecture rules (NON-NEGOTIABLE)

1. **Modular monolith.** Business code lives in `src/modules/<module>/` with layers:
   `domain/` (pure TS, no framework, no DB) → `application/` (use cases) → `infrastructure/` (Drizzle repos) → `ui/` (components).
2. `src/app/` contains routes only: thin pages that call use cases. No business logic in pages or components.
3. A module may import another module ONLY through its public `index.ts`. Never deep-import another module's internals.
4. `domain/` must never import from `next`, `react`, `drizzle-orm`, or `src/shared/db`.
5. All mutations go through the `createAction` wrapper (`src/shared/actions/create-action.ts`) which does: auth → permission check → Zod validation → tenant context → use case → audit log → typed result.
6. Use cases return `Result<T, AppError>`; never throw for expected business errors. Throw only for bugs.

## Multi-branch isolation (SECURITY CRITICAL)

- Every tenant-owned table has `branch_id`. Every query on those tables runs inside `withTenant(ctx, fn)`,
  which opens a transaction and sets `app.user_role` and `app.branch_id` so PostgreSQL RLS applies.
- Repositories receive `TenantContext` as a required first argument. No repository function without it.
- Branch admins can NEVER see, search, count, or select data from another branch — including dropdowns,
  autocomplete, reports, exports, error messages and URLs with foreign IDs (return 404, not 403).
- `branch_id` is NEVER taken from client input for branch admins; it comes from the session.
  Super admin's selected branch comes from the branch switcher cookie and is validated server-side.
- The app connects to the DB as a non-owner role WITHOUT `BYPASSRLS`. Migrations use the owner role.
- Every new tenant table needs: RLS enabled, a policy, and an isolation test in `tests/integration/tenant-isolation/`.

## Coding conventions

- TypeScript strict, no `any`, no `@ts-ignore`, no non-null `!` unless justified in a comment.
- Files: kebab-case (`transfer-student.ts`). Components: PascalCase exports. DB columns: snake_case. TS: camelCase.
- Money is stored as integer **piasters** (`amount_piasters`), never floats. Format with `formatEGP()`.
- Dates: `date` columns for calendar days, `timestamptz` for moments. Convert with helpers in `src/shared/lib/time.ts` only.
- All UI text in Arabic, centralized in `src/shared/i18n/ar.ts` (no hard-coded strings scattered in components).
- Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`), never `left`/`right`, for RTL correctness.
- Soft delete / archive only. Never hard-delete students, sessions, or attendance.
- Small functions, early returns, descriptive names. Comments explain WHY, not what.

## Workflow for every task

1. Read `docs/PROGRESS.md` and the relevant phase in `docs/PROJECT_PLAN.md`.
2. For anything non-trivial, present a short plan first and wait for approval.
3. Implement in small steps. Write/update tests alongside code (domain logic → unit tests first).
4. Before saying "done": run `pnpm typecheck && pnpm lint && pnpm test`. All must pass. Fix, don't skip.
5. Update `docs/PROGRESS.md` (what was done, decisions, open issues).
6. Suggest a Conventional Commit message, e.g. `feat(attendance): add quick marking screen`.
7. Do NOT start the next phase until the user confirms.

## Never do

- Never disable RLS, lint rules, type checks or tests to make something pass.
- Never commit `.env` or secrets. Never log passwords, access codes or full phone numbers.
- Never run destructive DB commands (`drop`, `truncate`, `db push --force`) without explicit permission.
- Never invent requirements. If the spec is ambiguous, ask, and record the decision in `docs/PROGRESS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
