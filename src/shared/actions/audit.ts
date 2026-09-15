import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { auditLogs, type AuditAction } from "@/shared/db/schema";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { env } from "@/shared/config/env";

export type AuditEntry = {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Appends to the audit trail inside the caller's transaction, so a mutation and its
 * audit row commit or roll back together — an action can never be performed without
 * leaving a trace, and a trace can never describe something that did not happen.
 */
export async function writeAuditLog(
  tx: Tx,
  ctx: TenantContext,
  entry: AuditEntry,
  request?: { ip: string | null; userAgent: string | null },
): Promise<void> {
  await tx.insert(auditLogs).values({
    branchId: ctx.branchId,
    userId: ctx.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: request?.ip ? hashIp(request.ip) : null,
    userAgent: request?.userAgent ?? null,
  });
}

/** Raw IPs are never stored — only a salted hash (PROJECT_PLAN 13.1). */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${env.LOOKUP_IP_SALT}:${ip}`).digest("hex");
}

/** Best-effort client details from the incoming request headers. */
export async function requestMetadata(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}
