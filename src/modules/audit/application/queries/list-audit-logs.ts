import { requirePermission } from "@/shared/actions/create-action";
import { PAGE_SIZE } from "@/shared/config/constants";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import {
  listAuditEntities,
  listAuditLogs as listAuditLogsRepo,
  type AuditRow,
} from "../../infrastructure/audit.repository";
import { auditFiltersSchema } from "../schemas";

export type AuditPage = {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  entities: string[];
};

/**
 * RLS narrows this to the caller's own branch for a branch admin, so the viewer needs
 * no branch filter of its own to be safe — the branch filter below is a convenience
 * for a super admin.
 */
export async function listAuditLogsPage(
  rawFilters: Record<string, string | string[] | undefined>,
): Promise<Result<AuditPage>> {
  const auth = await requirePermission("audit.read");
  if (!auth.ok) return auth;

  const filters = auditFiltersSchema.parse(rawFilters);

  const { rows, total, entities } = await withTenant(auth.data, async (tx) => {
    const page = await listAuditLogsRepo(auth.data, tx, {
      ...filters,
      pageSize: PAGE_SIZE,
    });
    return { ...page, entities: await listAuditEntities(auth.data, tx) };
  });

  return ok({ rows, total, page: filters.page, pageSize: PAGE_SIZE, entities });
}

export type { AuditRow };
