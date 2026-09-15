/**
 * PROJECT_PLAN 5.3 — the tenant scope of the current request.
 *
 * This object is the ONLY thing that decides which branch's rows a request may touch.
 * It is resolved server-side from the session and the branch-switcher cookie; nothing
 * in it ever comes from a request body or a query string (CLAUDE.md, "Multi-branch
 * isolation"). Phase 2 adds the resolver; this file defines the shape the database
 * layer depends on.
 */
export type Role = "super_admin" | "branch_admin" | "teacher";

export type TenantContext = {
  userId: string;
  role: Role;
  /** Null only for a super admin in "كافة الفروع" mode, which is read-only. */
  branchId: string | null;
  /** Set when role === "teacher"; scopes them to their own sessions. */
  teacherId: string | null;
};

/** True when this context may mutate tenant data at all. */
export function canMutateTenantData(ctx: TenantContext): boolean {
  if (ctx.role === "teacher") return true; // narrowed further by RLS to own sessions
  return ctx.branchId !== null;
}
