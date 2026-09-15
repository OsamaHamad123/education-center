# ADR 0001 — Row-level multi-tenancy with PostgreSQL RLS

- Status: Accepted
- Date: 2026-09-15

## Context

The system serves one education center with several branches (مدينة نصر، العبور، الجيزة). A branch admin
must never be able to read or modify another branch's data, while a super admin needs consolidated views
and teachers work across several branches. Branch isolation is the single most security-critical property
of the product.

Options considered:

1. **Database per branch** — strongest isolation, but cross-branch reports, shared teachers and student
   transfers become painful, and migrations must run N times.
2. **Schema per branch** — same drawbacks with a bit less operational cost.
3. **Shared schema with `branch_id` on every tenant table**, enforced in the application layer only.
4. **Shared schema with `branch_id` + PostgreSQL Row Level Security** (defense in depth).

## Decision

Option 4. Every tenant-owned table carries `branch_id`. Isolation is enforced twice:

- **Application layer:** repositories require a `TenantContext` first argument; `branch_id` for a branch
  admin always comes from the session, never from client input.
- **Database layer:** RLS is enabled and forced on every tenant table. Each request runs inside
  `withTenant(ctx, fn)`, which opens a transaction and sets the transaction-local settings
  `app.user_role`, `app.branch_id` and `app.teacher_id` that the policies read.

The application connects as the `school_app` role, which has **no `BYPASSRLS`**. Migrations and seeds run
as the separate owner role `school_owner`.

## Consequences

- A forgotten `where branch_id = ...` in a query returns zero rows instead of leaking data.
- Cross-branch reports, shared teachers and student transfers stay simple (one database, one schema).
- Every new tenant table must ship with: RLS enabled + forced, policies, and an isolation test under
  `tests/integration/tenant-isolation/`. This is part of the Definition of Done.
- Connection pooling is safe because `set_config(..., true)` is transaction-local.
- Records belonging to another branch must surface as `NOT_FOUND`, never `FORBIDDEN`, so existence is
  not revealed.
