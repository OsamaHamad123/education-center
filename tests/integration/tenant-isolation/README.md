# Tenant isolation suite

Every tenant-owned table gets a test here before it is considered done
(CLAUDE.md, "Multi-branch isolation").

Each test connects as the `school_app` role and asserts that:

1. A branch admin of branch A reads **zero** rows belonging to branch B — including
   through a deliberately unfiltered raw query, which is what proves RLS is doing
   the work rather than an application `where` clause.
2. A branch admin cannot insert or update a row carrying another branch's `branch_id`.
3. A super admin scoped to one branch sees only that branch; in "كافة الفروع" mode they
   can read everything but cannot mutate.
4. A teacher sees only their own sessions, and only in branches they are linked to.

Tests land here from Phase 1 onwards, once the schema and policies exist.
