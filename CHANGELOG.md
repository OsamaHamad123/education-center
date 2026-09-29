# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Day-by-day detail lives in
[`docs/PROGRESS.md`](docs/PROGRESS.md).

## [1.0.0] — 2026-09-29

The first complete release: every phase of `docs/PROJECT_PLAN.md` is done.

### Added

- **Foundation:** Next.js 16 (App Router), React 19, strict TypeScript, pnpm, ESLint module boundaries, Prettier,
  commitlint, and CI with typecheck, lint, unit, integration and e2e jobs.
- **Data and tenancy:** PostgreSQL 16 schema and migrations through Drizzle. Row Level Security on every
  tenant table, and an app role without `BYPASSRLS`. `withTenant` sets the tenant per transaction.
- **Authentication:** Better Auth with usernames, roles, a typed permission map, and the `createAction`
  pipeline (auth → permission → validation → tenant → audit).
- **Administration:** branches, branch-admin accounts, subjects, centre settings and an audit-log viewer.
- **Classes and students:** enrolment, class changes, branch transfers, archive and restore, Arabic-aware
  duplicate detection, and CSV import and export.
- **Teachers:** per-track rates, generated access codes and automatic login accounts.
- **Timetable engine:** period times computed from the school bell, conflict detection (redacted by viewer
  role), recompute on bell changes, and timetable copy. Database exclusion constraints make overlapping slots
  impossible.
- **Attendance and sessions:** an edit window per role, rosters, session snapshots, substitutions and
  cancellations.
- **Payroll and reports:** earnings in integer piasters from completed sessions, aggregated in SQL and
  reconciled against the domain calculation, plus printable reports.
- **Portals:** a teacher portal and a public parent/student lookup through one audited, self-authorising
  database function.
- **Deployment:** a standalone Docker image, `docker-compose.prod.yml` (db → migrate → app → Caddy → backup)
  and encrypted daily backups.
- **Documentation:** `docs/ARCHITECTURE.md`, ADRs, a security review, a runbook and screenshots.

### Security

- Eight findings from `docs/SECURITY-REVIEW.md`, all fixed. They include a per-account sign-in lockout,
  security headers, audited lookups and a safe post-login redirect.
- The per-account lockout now runs inside Better Auth's sign-in endpoints. It was enforced through server
  actions, which are public endpoints, so a direct request could skip it.

### Fixed

- The production compose file now passes `PORTAL_PHONE_SALT` to the app and `BACKUP_PASSPHRASE` to the backup
  job. `DATABASE_OWNER_URL` is optional at runtime, because the app never uses the owner role.

[1.0.0]: https://github.com/OsamaHamad123/education-center/releases/tag/v1.0.0
