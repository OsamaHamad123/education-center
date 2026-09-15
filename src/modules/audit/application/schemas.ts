import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");

/**
 * Filters arrive from the URL query string, so everything is optional and an empty
 * string means "not set" rather than "invalid".
 */
export const auditFiltersSchema = z.object({
  branchId: z.uuid().optional().catch(undefined),
  userId: z.string().min(1).optional().catch(undefined),
  entity: z.string().min(1).max(60).optional().catch(undefined),
  action: z
    .enum(["create", "update", "delete", "archive", "restore", "transfer", "login", "lookup"])
    .optional()
    .catch(undefined),
  from: isoDate.optional().catch(undefined),
  to: isoDate.optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type AuditFiltersInput = z.output<typeof auditFiltersSchema>;
