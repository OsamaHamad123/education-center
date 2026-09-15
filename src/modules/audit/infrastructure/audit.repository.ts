import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { auditLogs, branches, user, type AuditAction } from "@/shared/db/schema";

export type AuditFilters = {
  branchId?: string | undefined;
  userId?: string | undefined;
  entity?: string | undefined;
  action?: AuditAction | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
  pageSize: number;
};

export type AuditRow = {
  id: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  createdAt: Date;
  userName: string | null;
  username: string | null;
  branchName: string | null;
};

function buildWhere(filters: AuditFilters): SQL | undefined {
  const clauses: SQL[] = [];
  if (filters.branchId) clauses.push(eq(auditLogs.branchId, filters.branchId));
  if (filters.userId) clauses.push(eq(auditLogs.userId, filters.userId));
  if (filters.entity) clauses.push(eq(auditLogs.entity, filters.entity));
  if (filters.action) clauses.push(eq(auditLogs.action, filters.action));
  // `from`/`to` are calendar days; `to` is inclusive, so it reaches the end of that day.
  if (filters.from) clauses.push(gte(auditLogs.createdAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to) clauses.push(lte(auditLogs.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));
  return clauses.length > 0 ? and(...clauses) : undefined;
}

/**
 * The audit log is the one list here that grows without bound, so it pages on the
 * server rather than shipping every row to the browser.
 */
export async function listAuditLogs(
  _ctx: TenantContext,
  tx: Tx,
  filters: AuditFilters,
): Promise<{ rows: AuditRow[]; total: number }> {
  const where = buildWhere(filters);

  const rows = await tx
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
      userName: user.name,
      username: user.displayUsername,
      branchName: branches.name,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.userId))
    .leftJoin(branches, eq(branches.id, auditLogs.branchId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [totals] = await tx.select({ total: count() }).from(auditLogs).where(where);

  return { rows, total: totals?.total ?? 0 };
}

/** Distinct entity names present in the log, for the filter dropdown. */
export async function listAuditEntities(_ctx: TenantContext, tx: Tx): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ entity: auditLogs.entity })
    .from(auditLogs)
    .orderBy(auditLogs.entity);
  return rows.map((r) => r.entity);
}
