# PROJECT PLAN — Multi-Branch Education Center Management System

> Audience: Claude Code (implementer) and the project owner (reviewer).
> Rules that apply to every session are in `/CLAUDE.md`. This document is the source of truth for WHAT to build.
> Work strictly phase by phase (Section 14). Each phase has tasks, acceptance criteria, and a ready prompt.

---

## Table of Contents
1. Product Overview
2. Glossary (Arabic ↔ Code)
3. Roles & Permission Matrix
4. Tech Stack & Versions Policy
5. System Architecture
6. Folder Structure
7. Database Schema (complete)
8. Row Level Security (RLS) Design
9. Authentication & Authorization
10. Core Business Rules
11. Screens & Routes Map
12. UI/UX, RTL & Printing
13. Security, Testing, Deployment
14. Implementation Phases (0 → 10) with prompts
15. Definition of Done
16. Open Questions for the Owner
17. PROGRESS.md template

---

## 1. Product Overview

A cloud web system for an education center with multiple branches. Each branch operates independently
(classes, students, timetable, attendance). A central super admin oversees all branches, switches between
them, and sees consolidated reports. Teachers may teach in several branches. Parents/students look up
their own data without a password using a secure lookup.

Goals: fast, lightweight, mobile-first for attendance marking, clean A4 printing, strict branch isolation.

Non-goals (v1): online payments from students, SMS/WhatsApp sending automation, exams/grades, native mobile app.

---

## 2. Glossary (Arabic ↔ Code)

| Arabic | Code name | Notes |
|---|---|---|
| فرع | `branch` | e.g. فرع مدينة نصر |
| الإدارة العامة / المدير العام | `super_admin` | sees all branches |
| مدير الفرع | `branch_admin` | sees one branch only |
| معلم | `teacher` | may belong to many branches |
| شعبة | `class` | e.g. علمي 1 |
| المسار (علمي / أدبي) | `track`: `scientific` / `literary` | NOT "branch_type" |
| طالب | `student` | |
| كود الطالب | `student_code` | globally unique |
| قيد / تسجيل الطالب في شعبة | `enrollment` | history of class/branch |
| جدول الحصص | `timetable_slot` | weekly recurring plan |
| الحصة المنفذة / الجلسة | `class_session` | actual dated session |
| سجل الحضور | `attendance_record` | |
| حاضر / غائب / متأخر / بعذر | `present` / `absent` / `late` / `excused` | |
| المستحقات | `payroll` / `earnings` | |
| أرشيف الطلبة | archived students | status = `archived` |
| سجل التدقيق | `audit_log` | |

---

## 3. Roles & Permission Matrix

Roles: `super_admin`, `branch_admin`, `teacher`, plus unauthenticated `public` (lookup page).

| Capability | super_admin | branch_admin | teacher | public |
|---|---|---|---|---|
| Create/edit/deactivate branches | ✅ | ❌ | ❌ | ❌ |
| Create branch admin accounts | ✅ | ❌ | ❌ | ❌ |
| Switch branch / "All branches" view | ✅ | ❌ | ❌ | ❌ |
| Manage classes | ✅ (selected branch) | ✅ own branch | ❌ | ❌ |
| Add/edit/transfer/archive students | ✅ | ✅ own branch | ❌ | ❌ |
| Transfer student to another branch | ✅ | ❌ (request only, see Open Questions) | ❌ | ❌ |
| Create/edit teachers (global profile & rates) | ✅ | ❌ | ❌ | ❌ |
| Link teacher to branch | ✅ | ✅ own branch (link existing by phone) | ❌ | ❌ |
| Build/print timetable | ✅ | ✅ own branch | view own | view own class (via lookup) |
| Mark attendance | ✅ | ✅ own branch | ✅ own sessions, same day only | ❌ |
| Edit past attendance | ✅ | ✅ own branch (audited) | ❌ | ❌ |
| Teacher payroll report | ✅ all/any branch | ✅ own branch only | ✅ own, per branch + total | ❌ |
| Cross-branch comparison reports | ✅ | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ own branch | ❌ | ❌ |
| Lookup own student data | — | — | — | ✅ code + last 4 digits of parent phone |

Implement permissions as a single typed map in `src/shared/auth/permissions.ts`:
```ts
export const PERMISSIONS = {
  "branch.manage": ["super_admin"],
  "student.write": ["super_admin", "branch_admin"],
  "student.transfer_branch": ["super_admin"],
  "attendance.mark": ["super_admin", "branch_admin", "teacher"],
  // ...
} as const satisfies Record<string, readonly Role[]>;
export type Permission = keyof typeof PERMISSIONS;
```

---

## 4. Tech Stack & Versions Policy

| Layer | Choice |
|---|---|
| Framework | Next.js App Router (latest stable), React Server Components, Server Actions |
| Language | TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) |
| DB | PostgreSQL 16, extensions: `pgcrypto`, `btree_gist` |
| ORM | Drizzle ORM + drizzle-kit (SQL migrations committed to git) |
| Driver | `postgres` (postgres.js) |
| Auth | Better Auth + Drizzle adapter + `username` plugin |
| Validation | Zod |
| Env validation | `@t3-oss/env-nextjs` |
| UI | Tailwind CSS + shadcn/ui (RTL enabled), lucide-react icons, sonner toasts |
| Forms | plain `FormData` + Zod, validated in the browser and again on the server |
| Tables | @tanstack/react-table |
| Dates | date-fns + @date-fns/tz (`Africa/Cairo`) |
| Charts (reports) | recharts |
| PDF (phase 9, optional) | Playwright/Chromium server-side render of print pages |
| Tests | Vitest, Playwright |
| Quality | ESLint, Prettier (+ tailwind plugin), Husky, lint-staged, commitlint |
| Runtime | Docker (app + db), Node LTS |

Versions policy: install latest stable at Phase 0, then pin via lockfile. Check official docs if an API
differs from memory (Next.js, Better Auth and Tailwind change often). Middleware file may be named
`middleware.ts` or `proxy.ts` depending on the Next.js version — follow the installed version's docs.

---

## 5. System Architecture

### 5.1 Style
Modular Monolith + simplified Clean Architecture. One deployable Next.js app, one PostgreSQL database,
shared schema with `branch_id` (row-level multi-tenancy) protected at two layers (application + RLS).

```
Browser (RTL, mobile-first)
   │
   ▼
Next.js app/ routes  ──  thin pages, layouts, route handlers (print/PDF/export)
   │ calls
   ▼
Server Actions via createAction()  ── auth → permission → zod → tenant ctx → audit
   │ calls
   ▼
modules/*/application  (use cases)
   │ uses                         │ uses
   ▼                              ▼
modules/*/domain (pure rules)   modules/*/infrastructure (Drizzle repositories)
                                   │ inside withTenant() transaction
                                   ▼
                              PostgreSQL + RLS policies
```

### 5.2 Request lifecycle for a mutation
1. Client form validated with the same Zod schema.
2. Server Action `createAction({ permission, schema, handler })`:
   - loads session (Better Auth) → `401` if missing
   - resolves `TenantContext` (see 5.3)
   - checks permission → returns `FORBIDDEN`
   - parses input with Zod → returns `VALIDATION_ERROR` with field errors
   - runs handler inside `withTenant(ctx, tx => useCase(tx, ctx, input))`
   - writes `audit_logs` row for mutations
   - `revalidatePath`/`revalidateTag` as declared
   - returns `{ ok: true, data } | { ok: false, error }`

### 5.3 TenantContext
```ts
// src/shared/auth/tenant-context.ts
export type Role = "super_admin" | "branch_admin" | "teacher";

export type TenantContext = {
  userId: string;
  role: Role;
  /** null only for super_admin in "All branches" mode (read-only views). */
  branchId: string | null;
  /** set when role === "teacher" */
  teacherId: string | null;
};
```
Resolution rules:
- `branch_admin` → `branchId = user.branchId` (from DB, never from client).
- `super_admin` → `branchId` from cookie `selected_branch` (validated exists & active) or `null` for "All".
  Mutations that need a branch fail with `BRANCH_REQUIRED` when `branchId` is `null`.
- `teacher` → `branchId = null`, access scoped through `teacher_branches` and `teacherId` policies.

### 5.4 withTenant
```ts
// src/shared/db/with-tenant.ts
export async function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('app.user_role', ${ctx.role}, true),
      set_config('app.branch_id', ${ctx.branchId ?? ""}, true),
      set_config('app.teacher_id', ${ctx.teacherId ?? ""}, true)`);
    return fn(tx);
  });
}
```
`true` = transaction-local, safe with connection pooling.

### 5.5 Result & errors
```ts
// src/shared/lib/result.ts
export type AppErrorCode =
  | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION_ERROR"
  | "CONFLICT" | "BRANCH_REQUIRED" | "RATE_LIMITED" | "INTERNAL";
export type AppError = { code: AppErrorCode; message: string; fieldErrors?: Record<string, string[]> };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (code: AppErrorCode, message: string, fieldErrors?: AppError["fieldErrors"]): Result<never> =>
  ({ ok: false, error: { code, message, fieldErrors } });
```
Messages shown to users are Arabic from `src/shared/i18n/ar.ts`.
Records from other branches must produce `NOT_FOUND` (never reveal existence).

### 5.6 Reads
Server Components call query functions from `modules/*/application/queries/*` which also use `withTenant`.
No client-side fetching of tenant data except where interactivity requires it (via server actions).

### 5.7 Time
- Store `timestamptz` in UTC; `date` for session dates; `time` for slot times.
- "Today" is always computed in `Africa/Cairo` via `src/shared/lib/time.ts` (`todayInCairo()`).
- Week in Egypt starts Saturday. Store `day_of_week` as ISO 1–7 (1 = Monday … 6 = Saturday, 7 = Sunday);
  display order configurable: default Saturday → Thursday.

---

## 6. Folder Structure

```
.
├── CLAUDE.md
├── docs/
│   ├── PROJECT_PLAN.md
│   ├── PROGRESS.md
│   └── decisions/                 # ADRs: 0001-row-level-tenancy.md ...
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── .env.example
├── drizzle/                       # generated SQL migrations (committed)
├── public/brand/logo.png
├── src/
│   ├── app/
│   │   ├── layout.tsx             # <html lang="ar" dir="rtl">, font, Toaster
│   │   ├── (auth)/login/page.tsx
│   │   ├── (dashboard)/           # super_admin + branch_admin
│   │   │   ├── layout.tsx         # sidebar + topbar + BranchSwitcher
│   │   │   ├── page.tsx           # dashboard
│   │   │   ├── branches/
│   │   │   ├── users/
│   │   │   ├── classes/
│   │   │   ├── students/
│   │   │   ├── teachers/
│   │   │   ├── subjects/
│   │   │   ├── timetable/
│   │   │   ├── attendance/
│   │   │   ├── payroll/
│   │   │   ├── reports/
│   │   │   ├── audit/
│   │   │   └── settings/
│   │   ├── (teacher)/teacher/     # teacher portal
│   │   ├── lookup/                # public parent/student lookup
│   │   ├── print/                 # print-only layouts (A4)
│   │   └── api/auth/[...all]/route.ts
│   ├── modules/
│   │   ├── branches/
│   │   ├── users/
│   │   ├── classes/
│   │   ├── subjects/
│   │   ├── students/
│   │   ├── teachers/
│   │   ├── timetable/
│   │   ├── attendance/
│   │   ├── payroll/
│   │   ├── reports/
│   │   ├── lookup/
│   │   └── audit/
│   │       # each module:
│   │       #   domain/          types.ts, rules.ts, errors.ts (+ *.test.ts)
│   │       #   application/     use-cases/*.ts, queries/*.ts, schemas.ts (zod)
│   │       #   infrastructure/  *.repository.ts
│   │       #   ui/              components
│   │       #   index.ts         public API of the module
│   ├── shared/
│   │   ├── db/                    client.ts, with-tenant.ts, schema/*.ts, seed.ts
│   │   ├── auth/                  auth.ts (Better Auth), session.ts, tenant-context.ts, permissions.ts
│   │   ├── actions/               create-action.ts
│   │   ├── config/                env.ts, constants.ts
│   │   ├── i18n/                  ar.ts
│   │   ├── lib/                   result.ts, time.ts, money.ts, phone.ts, rate-limit.ts
│   │   └── ui/                    shadcn components, DataTable, PageHeader, PrintHeader, EmptyState
│   └── middleware.ts (or proxy.ts)
└── tests/
    ├── integration/
    │   ├── helpers/               test db, factories, contexts
    │   └── tenant-isolation/
    └── e2e/
```

---

## 7. Database Schema (complete)

Conventions: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`,
`updated_at timestamptz default now()` (updated by app), snake_case, FK `on delete restrict` unless noted.
Postgres enums via `pgEnum`.

### Enums
```
user_role:          super_admin | branch_admin | teacher
track:              scientific | literary
gender:             male | female | mixed
student_status:     active | archived
enrollment_end:     class_change | branch_transfer | archived
session_status:     completed | cancelled
attendance_status:  present | absent | late | excused
record_status:      active | inactive
audit_action:       create | update | delete | archive | restore | transfer | login | lookup
```

### 7.1 branches
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| name | text | not null, unique |
| code | text | not null, unique (e.g. `NSR`, `OBR`) |
| address | text | |
| phone | text | |
| is_active | boolean | default true |
| created_at / updated_at | timestamptz | |

### 7.2 Better Auth tables: user, session, account, verification
Generated by Better Auth CLI for the Drizzle adapter. Extend `user` with additional fields:
| column | type | notes |
|---|---|---|
| role | user_role | not null |
| branch_id | uuid FK branches | required when role = branch_admin, null otherwise (CHECK) |
| teacher_id | uuid FK teachers | required when role = teacher, null otherwise (CHECK) |
| is_active | boolean | default true; inactive users cannot log in |
| username | text | unique (username plugin). Admins: chosen username. Teachers: normalized phone |

CHECK:
```sql
check ((role = 'branch_admin' and branch_id is not null and teacher_id is null)
    or (role = 'super_admin'  and branch_id is null and teacher_id is null)
    or (role = 'teacher'      and branch_id is null and teacher_id is not null))
```

### 7.3 classes (الشعب)
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| branch_id | uuid | FK, not null |
| name | text | not null |
| track | track | not null |
| gender | gender | not null |
| grade_level | text | not null (e.g. `الصف الثالث الثانوي`) |
| is_active | boolean | default true |
| created_at / updated_at | | |
Unique: `(branch_id, name)`. Index: `(branch_id, is_active)`.

### 7.4 subjects
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| name | text | unique, not null (global list: فيزياء، كيمياء، تاريخ...) |
| is_active | boolean | default true |
Snapshot the subject name into sessions (`subject_name`) for historical accuracy.

### 7.5 students
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| student_code | text | unique, not null, generated `{BRANCHCODE}-{YY}-{seq5}` e.g. `OBR-26-00042` (never changes, even on transfer) |
| full_name | text | not null (4-part name) |
| student_phone | text | normalized E.164 |
| student_whatsapp | text | |
| parent_phone | text | not null |
| parent_whatsapp | text | |
| parent_phone_last4 | text | generated column: last 4 digits (lookup) |
| national_id | text | optional, unique if present |
| branch_id | uuid | current branch, FK not null |
| class_id | uuid | current class, FK not null |
| status | student_status | default active |
| join_date | date | not null |
| left_date | date | null unless archived |
| leave_reason | text | null unless archived |
| created_at / updated_at | | |
Indexes: `(branch_id, status)`, `(class_id)`, trigram index on `full_name` for Arabic search (`pg_trgm`), `(parent_phone)`.
CHECK: archived ⇒ left_date and leave_reason not null.

Student code sequence: table `student_code_counters (branch_id, year, last_value)` updated with `SELECT ... FOR UPDATE`.

### 7.6 student_enrollments (history — the "archive")
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| student_id | uuid | FK not null |
| branch_id | uuid | FK not null |
| class_id | uuid | FK not null |
| start_date | date | not null |
| end_date | date | null = current |
| end_reason | enrollment_end | null while current |
| note | text | |
| created_by | text FK user | |
Partial unique index: one open enrollment per student `(student_id) where end_date is null`.

### 7.7 teachers (global profile)
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| full_name | text | not null |
| phone | text | unique, not null (normalized) |
| specialization | text | |
| rate_scientific_piasters | integer | not null, >= 0 |
| rate_literary_piasters | integer | not null, >= 0 |
| status | record_status | default active |
| created_at / updated_at | | |

### 7.8 teacher_rate_history
Keeps a trail when rates change: `id, teacher_id, rate_scientific_piasters, rate_literary_piasters, effective_from date, changed_by, created_at`.

### 7.9 teacher_branches
| column | type | constraints |
|---|---|---|
| teacher_id | uuid | FK |
| branch_id | uuid | FK |
| is_active | boolean | default true |
| linked_at | timestamptz | |
PK `(teacher_id, branch_id)`.

### 7.10 branch_schedule_settings (bell schedule per branch & track)
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| branch_id | uuid | FK |
| track | track | |
| day_start_time | time | not null |
| period_duration_min | integer | 20–180 |
| periods_count | integer | 1–12 |
| working_days | smallint[] | ISO days, default `{6,7,1,2,3,4}` (Sat–Thu) |
Unique `(branch_id, track)`.

### 7.11 branch_breaks
`id, settings_id FK (cascade), after_period smallint, duration_min integer, label text`.
Period start/end times are COMPUTED in `timetable/domain/compute-periods.ts` from settings + breaks and
stored on slots for fast queries and conflict checking.

### 7.12 timetable_slots (weekly plan)
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| branch_id | uuid | FK |
| class_id | uuid | FK |
| teacher_id | uuid | FK |
| subject_id | uuid | FK |
| day_of_week | smallint | 1–7 |
| period_number | smallint | >= 1 |
| start_time | time | |
| end_time | time | > start_time |
| is_active | boolean | default true |
Constraints:
- Unique `(class_id, day_of_week, period_number) where is_active`.
- Teacher overlap across ALL branches, enforced in DB:
```sql
alter table timetable_slots add column minute_range int4range
  generated always as (int4range(
    extract(hour from start_time)::int*60 + extract(minute from start_time)::int,
    extract(hour from end_time)::int*60 + extract(minute from end_time)::int)) stored;
alter table timetable_slots add constraint no_teacher_overlap
  exclude using gist (teacher_id with =, day_of_week with =, minute_range with &&) where (is_active);
```
Also checked in the use case to give a friendly Arabic message naming the conflicting class/branch
(branch admin sees "المعلم مشغول في هذا الوقت" without the other branch's name; super admin sees details).
Note: travel time between branches is not modeled in v1 (see Open Questions).

### 7.13 class_sessions (actual sessions)
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| branch_id | uuid | FK |
| class_id | uuid | FK |
| teacher_id | uuid | FK |
| timetable_slot_id | uuid | FK nullable (null = extra/make-up session) |
| subject_name | text | snapshot |
| session_date | date | |
| period_number | smallint | |
| start_time / end_time | time | snapshot |
| track_applied | track | snapshot of class track |
| rate_applied_piasters | integer | snapshot of teacher rate for that track at creation |
| status | session_status | default completed |
| cancel_reason | text | required when cancelled |
| is_extra | boolean | default false |
| created_by | text FK user | |
| created_at / updated_at | | |
Unique `(class_id, session_date, period_number)`.
Indexes: `(teacher_id, session_date)`, `(branch_id, session_date)`.

### 7.14 attendance_records
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK (cascade restrict) |
| branch_id | uuid | denormalized for RLS & reporting |
| student_id | uuid | FK |
| status | attendance_status | not null |
| notes | text | |
| marked_by | text FK user | |
| marked_at | timestamptz | |
Unique `(session_id, student_id)`. Index `(student_id)`, `(branch_id, status)`.

### 7.15 audit_logs
`id, branch_id nullable, user_id nullable, action audit_action, entity text, entity_id text, before jsonb, after jsonb, ip text, user_agent text, created_at`.
Append-only: app role has INSERT + SELECT only. Index `(branch_id, created_at desc)`, `(entity, entity_id)`.

### 7.16 lookup_attempts (rate limiting without Redis)
`id, ip_hash text, student_code text, success boolean, created_at`. Index `(ip_hash, created_at)`.
Cleanup job/cron deletes rows older than 7 days.

### 7.17 center_settings (single row)
`id, center_name, logo_path, primary_color, lookup_enabled boolean, teacher_can_mark_attendance boolean, attendance_edit_window_days integer`.

---

## 8. Row Level Security (RLS) Design

DB roles:
- `school_owner` — owns tables, runs migrations.
- `school_app` — used by the app, `NOBYPASSRLS`, granted SELECT/INSERT/UPDATE (no DELETE on students/sessions/attendance/audit).

Helper functions (migration):
```sql
create or replace function app_role() returns text language sql stable as
$$ select nullif(current_setting('app.user_role', true), '') $$;
create or replace function app_branch_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.branch_id', true), '')::uuid $$;
create or replace function app_teacher_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.teacher_id', true), '')::uuid $$;
```

Policy pattern for tenant tables (`classes`, `students`, `timetable_slots`, `class_sessions`,
`attendance_records`, `student_enrollments`, `branch_schedule_settings`):
```sql
alter table classes enable row level security;
alter table classes force row level security;

create policy tenant_select on classes for select using (
  app_role() = 'super_admin' and (app_branch_id() is null or branch_id = app_branch_id())
  or app_role() = 'branch_admin' and branch_id = app_branch_id()
  or app_role() = 'teacher' and exists (
       select 1 from teacher_branches tb
       where tb.teacher_id = app_teacher_id() and tb.branch_id = classes.branch_id and tb.is_active)
);

create policy tenant_write on classes for insert with check (
  (app_role() = 'super_admin' and app_branch_id() is not null and branch_id = app_branch_id())
  or (app_role() = 'branch_admin' and branch_id = app_branch_id())
);
create policy tenant_update on classes for update
  using (branch_id = app_branch_id() and app_role() in ('super_admin','branch_admin'))
  with check (branch_id = app_branch_id());
```
Specific rules:
- `teachers`: super_admin all; branch_admin only teachers linked to their branch (via `teacher_branches`); teacher only self.
- `class_sessions` / `attendance_records` for teachers: SELECT where `teacher_id = app_teacher_id()`; INSERT/UPDATE only for own sessions where `session_date = (now() at time zone 'Africa/Cairo')::date` and `center_settings.teacher_can_mark_attendance`.
- `student_enrollments` & historical `attendance_records` of a transferred student: readable by the student's CURRENT branch (join on `students.branch_id = app_branch_id()`) so the full archive follows the student.
- Public lookup does NOT use RLS roles; it runs a dedicated, narrowly scoped query function using a
  separate `lookup` code path that returns only whitelisted fields for exactly one student (see 10.8).
- Seed & migrations run as `school_owner`.

Every policy is covered by tests in `tests/integration/tenant-isolation/` that connect as `school_app`.

---

## 9. Authentication & Authorization

- Better Auth with email disabled; `username` plugin for sign-in with username + password.
- Admin accounts: created by super admin (username + temporary password, forced change on first login via `must_change_password` field).
- Teacher accounts: created when super admin creates/activates a teacher. `username` = normalized phone
  (e.g. `+2010xxxxxxxx`), password = 6-digit access code generated and shown ONCE (can be reset).
- Login page: single form with tabs "إدارة" / "معلم" (teacher tab asks for phone + access code).
- Session: httpOnly secure cookie, 7 days, rolling. Logout everywhere on password reset.
- Brute-force protection: Better Auth rate limit + lockout after 5 failed attempts for 15 min.
- Route protection (middleware/proxy): `/(dashboard)` → super_admin|branch_admin; `/teacher` → teacher; `/lookup` public; `/print/*` authenticated.
- Middleware only checks presence of a session; real authorization happens server-side in `createAction` and queries.
- Branch switcher: server action `selectBranch(branchId | "all")` sets cookie `selected_branch` (httpOnly, sameSite=lax). Visible only to super_admin. Dashboard shows a clear banner with the active branch name; mutations disabled in "All branches" mode.

`createAction` sketch:
```ts
export function createAction<S extends z.ZodTypeAny, T>(opts: {
  permission: Permission;
  schema: S;
  requireBranch?: boolean;
  audit?: { action: AuditAction; entity: string };
  handler: (args: { tx: Tx; ctx: TenantContext; input: z.infer<S> }) => Promise<Result<T>>;
}) {
  return async (raw: unknown): Promise<Result<T>> => { /* see 5.2 */ };
}
```

---

## 10. Core Business Rules

### 10.1 Branches
- Deactivating a branch hides it from switchers and blocks logins of its branch admins; data is kept.
- Branch code is immutable after students exist.

### 10.2 Classes
- Changing a class's `track` is blocked if it has sessions (to protect payroll history); create a new class instead.
- Deactivating a class requires zero active students.

### 10.3 Students
- Create: generates `student_code`, opens an enrollment (start_date = join_date).
- Phone numbers normalized to Egyptian format (`01xxxxxxxxx` → `+201xxxxxxxxx`) in `shared/lib/phone.ts`; validate Egyptian mobile prefixes.
- Duplicate warning (not block) if same full_name + parent_phone exists in the branch.
- **Change class (same branch):** close current enrollment (`end_reason = class_change`, end_date = today), open new, update `students.class_id`. Past attendance untouched.
- **Transfer branch (super_admin):** close enrollment (`branch_transfer`), open new in target branch/class, update `students.branch_id` and `class_id`, keep `student_code`. Old branch keeps a read-only "transferred out" entry in its list filter. Audit with before/after.
- **Archive:** status = archived, left_date, leave_reason required, close enrollment (`archived`). Archived students excluded from attendance sheets; visible under "أرشيف الطلبة". **Restore** reopens an enrollment.
- No hard delete.

### 10.4 Timetable
- Settings per branch + track generate periods: `start = day_start + Σ(previous durations + breaks)`.
- Assign slot: class + day + period + subject + teacher. Validations: teacher linked & active in branch; day in working_days; period ≤ periods_count; no class duplicate; no teacher overlap (any branch).
- Changing settings recomputes future slot times; warns if it creates conflicts and lists them.
- Grid editor: rows = days (Sat→Thu), columns = periods, cell = subject + teacher; click cell to edit.
- Print: per class A4 landscape; per teacher (all branches for super admin / own branch for branch admin).

### 10.5 Sessions & Attendance
- Attendance screen flow: (branch auto) → date (default today Cairo) → class → period list from timetable for that day.
- Opening a period creates the `class_session` lazily on first save (not on view), snapshotting subject, times, track and the teacher's current rate.
- Default all students to `present`; one tap cycles/sets status; "mark all present" button; notes per student.
- Save is idempotent (upsert by `(session_id, student_id)`). Show saved state and last editor.
- Admin may add an extra session (`is_extra`, no slot) choosing teacher/subject/period.
- Substitute teacher: admin can change the session's teacher before/after saving; rate re-snapshotted from the substitute.
- Cancel session: status cancelled + reason; excluded from payroll; attendance kept but hidden from rates.
- Editing past attendance: allowed within `attendance_edit_window_days` for branch_admin (super_admin always); every change audited.
- Students listed = active students whose enrollment covers `session_date` in that class.

### 10.6 Payroll (المستحقات)
Pure domain function (unit tested):
```ts
// modules/payroll/domain/calculate-earnings.ts
export type PayrollSession = { track: "scientific" | "literary"; ratePiasters: number; status: "completed" | "cancelled"; branchId: string };
export function calculateEarnings(sessions: PayrollSession[]) {
  // only completed sessions; group by branch and track; totals in piasters
}
```
- Formula: earnings = Σ(rate_applied of completed scientific sessions) + Σ(rate_applied of completed literary sessions). Using snapshots means rate changes never alter history.
- Report inputs: teacher (or all teachers), date range (from–to inclusive), branch filter (super admin: one/all; branch admin: fixed; teacher: own branches).
- Output: per teacher → per branch → scientific count, literary count, amounts, total; grand total; drill-down list of sessions.
- Printable A4 + CSV export.

### 10.7 Reports
- Branch dashboard: today's sessions done/remaining, attendance rate today, top absent students this week.
- Student attendance report: per student, date range, percentages by status.
- Class attendance report: matrix students × dates.
- Absence alerts list: students above X% absence (configurable) — with WhatsApp click-to-chat link (`https://wa.me/...`) to parent (no automation).
- Super admin: branch comparison (attendance %, sessions count, payroll totals) with charts, date range.

### 10.8 Public Lookup (ولي الأمر / الطالب)
- Inputs: `student_code` + last 4 digits of parent phone. Both required.
- Rate limit: max 5 failed attempts per IP per 15 min and per student_code per hour → `RATE_LIMITED`.
- Same generic error for "not found" and "wrong digits" (no enumeration).
- Returns only: first name + family name initial… (show full name? see Open Questions), branch name, class name, weekly timetable, attendance % for current month and term, list of absence/late dates with notes. No phones, no other students.
- Result page is not cached, `noindex`, and expires: show data in the response only (no shareable URL with the code).
- Log to `lookup_attempts` and `audit_logs` (hashed IP).

### 10.9 Teacher Portal
- Home: today's sessions across all branches (grouped by branch) with "رصد الحضور" button if allowed.
- Weekly timetable (tabs per branch + combined).
- Sessions history & earnings: date range, per branch and total (read-only).
- Change access code.

---

## 11. Screens & Routes Map

| Route | Role | Purpose |
|---|---|---|
| `/login` | public | admin / teacher login tabs |
| `/` (dashboard) | SA, BA | KPIs for selected branch or all |
| `/branches`, `/branches/new`, `/branches/[id]` | SA | CRUD branches |
| `/users` | SA | branch admin accounts |
| `/classes`, `/classes/[id]` | SA*, BA | classes list, class page (students, timetable) |
| `/subjects` | SA | subjects list |
| `/students` | SA*, BA | list with search, filters (class, status, transferred out) |
| `/students/new`, `/students/[id]` | SA*, BA | form, profile (info, enrollment history, attendance history) |
| `/students/archive` | SA*, BA | archived students, restore |
| `/teachers`, `/teachers/[id]` | SA, BA (linked only) | profile, rates (SA), branches, sessions |
| `/timetable/settings` | SA*, BA | bell schedule per track |
| `/timetable` | SA*, BA | grid editor per class; teacher view |
| `/attendance` | SA*, BA | quick marking (mobile-first) |
| `/attendance/sessions` | SA*, BA | sessions log, cancel, substitute, extra session |
| `/payroll` | SA, BA | earnings report |
| `/reports/*` | SA, BA | attendance reports, absence alerts, branch comparison (SA) |
| `/audit` | SA, BA | audit log viewer |
| `/settings` | SA | center settings, logo |
| `/teacher`, `/teacher/timetable`, `/teacher/earnings`, `/teacher/attendance/[sessionId]` | T | teacher portal |
| `/lookup` | public | parent/student lookup |
| `/print/timetable/class/[id]`, `/print/timetable/teacher/[id]`, `/print/attendance/...`, `/print/payroll` | SA, BA, (T own) | A4 print pages |

`SA*` = requires a specific branch selected for mutations.

---

## 12. UI/UX, RTL & Printing

- `<html lang="ar" dir="rtl">`, font Cairo (next/font/google), Arabic-Indic vs Western digits: use Western digits (0-9) for phones & codes, configurable later.
- shadcn/ui with RTL; verify Dialog, Dropdown, Sheet, Select, Calendar render correctly in RTL.
- Layout: collapsible sidebar on desktop, bottom nav or sheet menu on mobile. Top bar: center logo, BranchSwitcher (SA), user menu.
- Attendance screen (mobile): large tap targets (≥ 44px), sticky header (class, period, counts), sticky save button, 4 colored status buttons per student row with icons + text (never color only), works on 360px width.
- Tables: TanStack Table with Arabic search, pagination, column visibility; card layout on mobile.
- States: every list has loading skeleton, empty state, error state.
- Forms: inline Arabic validation messages, disabled submit while pending, success toast.
- Accessibility: labels on inputs, focus visible, keyboard navigation.
- Dates displayed `dd/MM/yyyy` and Arabic day names.
- Money displayed `1,250.00 ج.م`.

Printing:
- Dedicated `/print/*` routes with a minimal layout and `@page { size: A4; margin: 12mm; }`.
- `PrintHeader`: center logo, center name, branch name, report title, date range, print date.
- `PrintFooter`: page numbers (CSS counters where supported), signature lines for payroll.
- Timetable: landscape; attendance sheets & payroll: portrait. Avoid row splits (`break-inside: avoid`).
- "طباعة" button calls `window.print()`. Server PDF generation (Playwright) is Phase 9 optional.

---

## 13. Security, Testing, Deployment

### 13.1 Security checklist
- RLS on all tenant tables + app role without BYPASSRLS.
- Zod validation for every input; UUID params validated.
- No IDs trusted from client without scoped lookup.
- Security headers (CSP basic, X-Frame-Options DENY except none needed, Referrer-Policy, HSTS in prod).
- Rate limiting: login, lookup.
- Secrets only via env; `.env.example` committed without values.
- Audit logs for all mutations, logins, lookups.
- Mask phones in logs (`+2010****1234`).
- Daily encrypted DB backups with 14-day retention; restore tested.

### 13.2 Testing strategy
- **Unit (Vitest):** all `domain/` functions — earnings calculation, period computation, phone normalization, student code generation, enrollment transitions, attendance percentage.
- **Integration (Vitest + real Postgres in Docker, separate `school_test` DB, migrations applied, connecting as `school_app`):** use cases & repositories; **tenant isolation suite** (mandatory):
  - branch admin A cannot list/get/update/count students, classes, sessions, attendance, teachers of branch B;
  - super admin in branch mode sees only that branch; in "all" mode sees all but cannot mutate;
  - teacher sees only own sessions/branches;
  - RLS blocks a raw query that forgets the `branch_id` filter;
  - timetable exclusion constraint blocks cross-branch teacher overlap;
  - rate change does not change past payroll.
- **E2E (Playwright):** login flows; branch switch; create student → mark attendance → payroll shows session; transfer student keeps history; lookup success + rate limit; mobile viewport attendance.
- CI (GitHub Actions): install → typecheck → lint → unit → integration (postgres service) → build. E2E on main.

### 13.3 Deployment
- Recommended v1: single VPS (2 vCPU / 4GB) with Docker Compose: `app` (Next.js standalone build), `db` (Postgres 16 with volume), `caddy` (automatic HTTPS), `backup` (pg_dump cron to off-site storage).
- Alternative: Vercel (app) + managed Postgres that supports RLS & roles (Neon/Supabase). Ensure pooled connections keep `set_config(..., true)` inside transactions.
- Env vars: `DATABASE_URL` (app role), `DATABASE_OWNER_URL` (migrations), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `LOOKUP_IP_SALT`, `NODE_ENV`, `TZ=Africa/Cairo`.
- Migrations run on deploy with the owner URL before the app starts.
- Health check route `/api/health` (DB ping).

---

## 14. Implementation Phases

> Rule: one phase per Claude Code session (or split big phases). Start each session with the phase prompt.
> At the end of each phase: all checks green, PROGRESS.md updated, user reviews, git commit + tag `phase-N`.

---

### Phase 0 — Project setup & clean code tooling
**Tasks**
1. Create Next.js app (TypeScript, Tailwind, ESLint, App Router, `src/`, alias `@/*`) with pnpm.
2. Strict tsconfig (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`).
3. Install deps from Section 4. Init shadcn/ui (RTL). Add base components: button, input, label, form, select, dialog, sheet, dropdown-menu, table, card, badge, tabs, skeleton, sonner, calendar, popover.
4. Prettier + tailwind plugin, ESLint rules: no-explicit-any, import boundaries (`eslint-plugin-boundaries` or `no-restricted-imports`) enforcing module public APIs and domain purity.
5. Husky + lint-staged (pre-commit: lint-staged + typecheck), commitlint conventional.
6. `docker-compose.yml` (Postgres 16, TZ Africa/Cairo, main DB + test DB init script creating roles `school_owner`, `school_app`, extensions `pgcrypto`, `btree_gist`, `pg_trgm`).
7. `src/shared/config/env.ts` with t3 env; `.env.example`.
8. Root layout: `lang="ar" dir="rtl"`, Cairo font, Toaster, base theme colors.
9. Create folder skeleton (Section 6) with placeholder `index.ts` files; `shared/lib/result.ts`, `time.ts`, `money.ts`, `phone.ts` with unit tests.
10. Vitest config (unit + integration projects), Playwright config, sample tests.
11. `docs/PROGRESS.md` from template (Section 17), `docs/decisions/0001-row-level-tenancy.md`.
12. GitHub Actions CI workflow.
**Acceptance:** `pnpm dev` shows an Arabic RTL placeholder page; `pnpm typecheck && pnpm lint && pnpm test` pass; DB container runs; a commit with a bad message is rejected; importing a module's internals from another module fails lint.

**Prompt:**
```
Read CLAUDE.md and docs/PROJECT_PLAN.md (sections 4, 5, 6, 13.2 and Phase 0).
Implement Phase 0 exactly. Start by showing me a short plan and the list of packages you will install,
then wait for my approval. After implementing, run typecheck, lint and tests, show results,
update docs/PROGRESS.md and propose a commit message.
```

---

### Phase 1 — Database schema, migrations, RLS, seed
**Tasks**
1. Drizzle schema files in `src/shared/db/schema/` for all tables in Section 7 (Better Auth tables via its CLI, then extended).
2. Enums, checks, unique & partial indexes, generated columns, exclusion constraint (custom SQL migration where Drizzle can't express it).
3. `drizzle.config.ts` using `DATABASE_OWNER_URL`. Generate + apply migrations.
4. RLS migration: helper functions, enable/force RLS, policies (Section 8), grants for `school_app`.
5. `db/client.ts` (app role) and `with-tenant.ts`.
6. Seed script (`pnpm db:seed`): center settings, 3 branches (مدينة نصر NSR, العبور OBR, الجيزة GIZ), 1 super admin, 1 branch admin per branch, 8 subjects, 6 teachers (2 shared across branches), 4 classes per branch (علمي/أدبي × ذكور/إناث), 15 students per class with Arabic names, schedule settings, a full week timetable, 2 weeks of sessions & attendance. Print login credentials to console.
7. Integration test helpers: reset test DB, factories, `ctxFor(role, branch)`.
8. First tenant isolation tests for students & classes.
**Acceptance:** migrations apply cleanly on empty DB; seed runs twice without errors (idempotent or reset flag); isolation tests prove branch admin A sees 0 rows of branch B even with a raw unfiltered query; overlapping teacher slots across branches are rejected by the DB.

**Prompt:**
```
Implement Phase 1 from docs/PROJECT_PLAN.md (sections 7 and 8 are the source of truth).
Show me the schema design as a list of tables/constraints first and flag anything you think is wrong
or missing before writing code. Then implement, including RLS policies, seed data and isolation tests.
Run all checks and update PROGRESS.md.
```

---

### Phase 2 — Authentication, roles, tenant context, app shell
**Tasks**
1. Better Auth config (username plugin, extra user fields, rate limiting, session cookie), `/api/auth/[...all]`.
2. Login page with "إدارة" and "معلم" tabs; forced password change page.
3. `getSession()`, `resolveTenantContext()`, `permissions.ts`, `createAction()`, `requirePermission()` for queries.
4. Middleware/proxy route protection.
5. Dashboard layout: sidebar (items filtered by permission), top bar, BranchSwitcher (SA) with "كافة الفروع", active-branch banner, mobile navigation.
6. Teacher layout shell. Logout.
7. Audit logging of login/logout.
8. Tests: createAction unit tests (unauthorized, forbidden, validation, branch required), e2e login for each role, branch admin cannot access `/branches`.
**Acceptance:** each seeded role logs in and lands on the right area; switching branch changes all data scope; branch admin never sees the switcher; mutations blocked in "all branches" mode.

**Prompt:**
```
Implement Phase 2 from docs/PROJECT_PLAN.md (sections 3, 5.2–5.5, 9, 11, 12).
Plan first, then build. Verify Better Auth API against its current docs. Include the tests listed.
```

---

### Phase 3 — Branches, users, subjects, center settings (Super Admin)
**Tasks:** CRUD branches (activate/deactivate), branch admin accounts (create, reset password, deactivate), subjects CRUD, center settings with logo upload (stored in `public/uploads` or object storage abstraction), audit log viewer (filters: branch, user, entity, date).
**Acceptance:** all business rules in 10.1; audit entries created; forms validated; responsive.

**Prompt:**
```
Implement Phase 3 from docs/PROJECT_PLAN.md. Follow module layering strictly (domain/application/infrastructure/ui).
Reuse shared DataTable, PageHeader, EmptyState components (create them if missing).
```

---

### Phase 4 — Classes & Students
**Tasks:** classes CRUD (rules 10.2); students list (search Arabic names by trigram, filters, pagination, mobile cards); create/edit student (code generation, phone normalization, duplicate warning); student profile (info, enrollment timeline, attendance summary placeholder); change class; transfer branch (SA); archive with reason; archive list & restore; CSV import of students (with preview & row-level errors) and CSV export.
**Acceptance:** rules 10.3 fully covered by unit + integration tests; transfer keeps code and history visible to new branch; old branch sees "transferred out"; isolation tests for students/enrollments.

**Prompt:**
```
Implement Phase 4 from docs/PROJECT_PLAN.md (sections 7.3, 7.5, 7.6, 10.2, 10.3).
Write domain tests for enrollment transitions (create, change class, transfer, archive, restore) before the use cases.
```

---

### Phase 5 — Teachers
**Tasks:** teachers list (SA all; BA linked only); create teacher (SA) with rates + auto teacher account + one-time access code display; link existing teacher to branch by phone (BA/SA); edit rates (SA) writing `teacher_rate_history`; deactivate/unlink; reset access code; teacher profile page (branches, weekly load, recent sessions).
**Acceptance:** BA cannot see unlinked teachers or rates edit controls; rate history stored; isolation tests for teachers.

**Prompt:**
```
Implement Phase 5 from docs/PROJECT_PLAN.md (sections 7.7–7.9, 9, 3). Plan first.
```

---

### Phase 6 — Timetable engine
**Tasks:** schedule settings per branch & track with breaks (form + live preview of computed periods); `compute-periods` domain function + tests; grid editor per class (Sat→Thu × periods) with cell dialog (subject, teacher filtered to linked & free); conflict messages (class duplicate, teacher overlap across branches with role-appropriate detail); copy timetable from another class; teacher timetable view; print pages (class A4 landscape, teacher); settings change recomputation with conflict report.
**Acceptance:** rules 10.4; exclusion constraint + friendly message; print looks clean in Chrome print preview at A4.

**Prompt:**
```
Implement Phase 6 from docs/PROJECT_PLAN.md (sections 7.10–7.12, 10.4, 12 printing).
Start with the pure domain function compute-periods and its tests, then the conflict checking, then UI.
```

---

### Phase 7 — Attendance & sessions
**Tasks:** mobile-first attendance screen (flow 10.5); lazy session creation with snapshots; upsert attendance; mark-all-present; notes; sessions log with filters; cancel session; substitute teacher; extra session; edit window rule; teacher marking from portal (if setting enabled, same day only); print daily class attendance sheet; optimistic UI with safe rollback.
**Acceptance:** rules 10.5 tested; rate snapshot verified; e2e on 390px viewport marks a full class in under 30 seconds of interactions; isolation tests for sessions & attendance incl. teacher scope.

**Prompt:**
```
Implement Phase 7 from docs/PROJECT_PLAN.md (sections 7.13, 7.14, 8 teacher policies, 10.5, 12 attendance UX).
Mobile experience is the priority: show me the screen layout plan before building.
```

---

### Phase 8 — Payroll & reports
**Tasks:** `calculateEarnings` domain + tests; payroll report (filters per role, grouping teacher → branch → track, drill-down sessions, CSV, print with signature lines); student attendance report; class attendance matrix; absence alerts with wa.me links; dashboards (branch KPIs; SA comparison with recharts); print pages with PrintHeader.
**Acceptance:** rules 10.6–10.7; changing a teacher's rate after sessions does not change past totals (test); BA can't filter other branches; numbers match seed data verification query.

**Prompt:**
```
Implement Phase 8 from docs/PROJECT_PLAN.md (sections 10.6, 10.7, 12 printing).
Aggregate in SQL (not in JS loops over thousands of rows), but keep the money rules in the pure domain function and test both agree.
```

---

### Phase 9 — Teacher portal, public lookup, PDF
**Tasks:** teacher portal pages (10.9); public lookup (10.8) with rate limiting, generic errors, no caching, noindex, mobile design; optional server-side PDF for print routes via Playwright (route handler `/api/pdf?path=`, auth-checked, allowlisted paths).
**Acceptance:** lookup cannot enumerate (tests); rate limit works; teacher sees combined + per-branch data only for own branches; PDFs render Arabic correctly with the Cairo font.

**Prompt:**
```
Implement Phase 9 from docs/PROJECT_PLAN.md (sections 10.8, 10.9). Treat the public lookup as a security feature:
list the attack scenarios you are defending against, then implement and test each.
```

---

### Phase 10 — Hardening, performance, deployment
**Tasks:** security headers; review all queries for N+1 and add indexes (EXPLAIN on heavy reports); error boundaries & not-found pages in Arabic; `/api/health`; Dockerfile (standalone, non-root); production compose with Caddy + backups; migration on deploy; README (setup, deploy, backup/restore, create first super admin command `pnpm create-super-admin`); final full e2e run; accessibility pass; Lighthouse mobile ≥ 90 on attendance and lookup pages.
**Acceptance:** fresh server deploy from README works; backup + restore tested; all tests green.

**Prompt:**
```
Implement Phase 10 from docs/PROJECT_PLAN.md (section 13). Produce a security review report of the whole codebase first
(tenant isolation, auth, input validation, lookup), fix findings, then do deployment work.
```

---

## 15. Definition of Done (every task)
- [ ] Meets acceptance criteria of its phase.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass (and e2e where relevant).
- [ ] New tenant data paths have isolation tests.
- [ ] No business logic in `app/` or UI components; domain is pure.
- [ ] All user-facing text in Arabic from `ar.ts`; RTL verified on mobile width.
- [ ] Loading / empty / error states exist.
- [ ] Mutations audited.
- [ ] `docs/PROGRESS.md` updated; commit message proposed.

---

## 16. Open Questions for the Owner (answer before the related phase)
1. Can a branch admin request a student transfer to another branch, or only super admin performs it? (default: SA only)
2. Can teachers mark attendance themselves? Same day only? (default: yes, same day, toggle in settings)
3. Lookup result: show student full name or partial (e.g. first name + father)? (default: first two names)
4. ~~Is there a minimum gap between a teacher's sessions in different branches (travel time)?~~ **Answered 2026-09-17 by building it** (`drizzle/0019`): `center_settings.teacher_travel_minutes`, 0 by default so the v1 behaviour is unchanged, applied between branches only.
5. Should an `excused` or `late` student count as present in attendance percentage? (default: late = present, excused excluded from denominator)
6. Are teacher payments ever per-hour or fixed monthly instead of per session? (default: per session only)
7. ~~Academic terms/years: do reports need a "term" concept?~~ **Answered 2026-09-17 by building it** (`drizzle/0017`): a term is a named date range, centre-wide, offered as a preset on reports and used for the public lookup's "الفصل" figure. Reports still compute on date ranges; fees stay monthly.
8. Is sending automatic WhatsApp/SMS to parents needed later? (default: manual wa.me links)
9. Default attendance edit window for branch admins? (default: 7 days)
10. Hosting preference and budget: VPS in Egypt/EU vs managed cloud?

---

## 17. PROGRESS.md template
```md
# PROGRESS

## Current phase
Phase N — <name> — status: in progress | review | done

## Completed
- [x] Phase 0 — setup (commit abc123, tag phase-0)

## Decisions log
| Date | Decision | Reason |
|---|---|---|

## Deviations from PROJECT_PLAN
- ...

## Known issues / TODO
- ...

## Next steps
- ...
```
