import { revalidatePath, updateTag } from "next/cache";
import type { z } from "zod";
import { hasPermission, type Permission } from "@/shared/auth/permissions";
import { resolveTenantContext } from "@/shared/auth/session";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { requestMetadata, writeAuditLog, type AuditEntry } from "./audit";

/**
 * PROJECT_PLAN 5.2 — the single gate every mutation passes through.
 *
 * auth → permission → validation → tenant context → use case → audit → typed result.
 *
 * Nothing is optional in that order, and there is deliberately no way to skip a step:
 * a server action that does not go through here is a bug, and CLAUDE.md rule 5 makes
 * that reviewable.
 */

export type ActionHandler<TInput, TOutput> = (args: {
  tx: Tx;
  ctx: TenantContext;
  input: TInput;
}) => Promise<Result<TOutput>>;

export type CreateActionOptions<TSchema extends z.ZodTypeAny, TOutput> = {
  permission: Permission;
  schema: TSchema;
  /** Mutations that write tenant rows need one specific branch selected. */
  requireBranch?: boolean;
  audit?: Omit<AuditEntry, "entityId" | "before" | "after"> & {
    /** Pulls the entity id out of the result once the use case has run. */
    entityId?: (output: TOutput) => string | null;
  };
  revalidate?: { paths?: string[]; tags?: string[] };
  handler: ActionHandler<z.output<TSchema>, TOutput>;
};

export function createAction<TSchema extends z.ZodTypeAny, TOutput>(
  options: CreateActionOptions<TSchema, TOutput>,
) {
  return async (raw: unknown): Promise<Result<TOutput>> => {
    const ctx = await resolveTenantContext();
    if (!ctx) return err("UNAUTHORIZED", ar.errors.UNAUTHORIZED);

    if (!hasPermission(ctx.role, options.permission)) {
      return err("FORBIDDEN", ar.errors.FORBIDDEN);
    }

    // A super admin in "كافة الفروع" mode has no branch, so there is nowhere to write.
    if (options.requireBranch !== false && ctx.role !== "teacher" && ctx.branchId === null) {
      return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);
    }

    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) {
      return err("VALIDATION_ERROR", ar.errors.VALIDATION_ERROR, fieldErrorsOf(parsed.error));
    }

    let result: Result<TOutput>;
    try {
      result = await withTenant(ctx, async (tx) => {
        const handled = await options.handler({ tx, ctx, input: parsed.data });

        if (handled.ok && options.audit) {
          await writeAuditLog(
            tx,
            ctx,
            {
              action: options.audit.action,
              entity: options.audit.entity,
              entityId: options.audit.entityId?.(handled.data) ?? null,
            },
            await requestMetadata(),
          );
        }

        // Returning a failure from inside the transaction would commit a partial
        // write, so an unsuccessful Result rolls the transaction back.
        if (!handled.ok) throw new RollbackWith(handled);
        return handled;
      });
    } catch (error) {
      if (error instanceof RollbackWith) return error.result as Result<TOutput>;
      // A thrown error is a bug, not a business outcome (CLAUDE.md rule 6) — but the
      // error OBJECT is not safe to log. A Postgres unique violation carries
      // `Key (phone)=(+201012345678) already exists.` in its detail, and logs are
      // copied and retained far more casually than the database is
      // (docs/SECURITY-REVIEW.md, finding 3).
      console.error("[createAction] unexpected error", describeError(error));
      return err("INTERNAL", ar.errors.INTERNAL);
    }

    if (result.ok && options.revalidate) {
      for (const path of options.revalidate.paths ?? []) revalidatePath(path);
      // updateTag, not revalidateTag: we are always inside a server action here, and
      // the caller must see their own write on the next read (Next.js 16 semantics).
      for (const tag of options.revalidate.tags ?? []) updateTag(tag);
    }

    return result;
  };
}

/**
 * Read paths do not mutate, so they do not need the full pipeline — but they still
 * need the permission check. Queries call this before touching a repository.
 */
export async function requirePermission(permission: Permission): Promise<Result<TenantContext>> {
  const ctx = await resolveTenantContext();
  if (!ctx) return err("UNAUTHORIZED", ar.errors.UNAUTHORIZED);
  if (!hasPermission(ctx.role, permission)) return err("FORBIDDEN", ar.errors.FORBIDDEN);
  return ok(ctx);
}

/**
 * The SHAPE of an error, never its contents: enough to find the bug, nothing that
 * identifies a person. `detail`, `where` and the query parameters are all dropped.
 */
/** Only the first line: a driver appends the query and its parameters below it. */
function firstLine(message: string): string {
  const [first] = message.split("\n");
  return first ?? "";
}

function describeError(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { kind: typeof error };

  const pg = error as Error & { code?: string; constraint_name?: string; table_name?: string };
  return {
    name: error.name,
    // A driver message names the constraint, not the values; the detail is what
    // carries the row, and it is deliberately absent.
    message: firstLine(error.message),
    ...(pg.code ? { code: pg.code } : {}),
    ...(pg.constraint_name ? { constraint: pg.constraint_name } : {}),
    ...(pg.table_name ? { table: pg.table_name } : {}),
  };
}

/** Carries a failed Result out through the transaction boundary so the tx rolls back. */
class RollbackWith extends Error {
  constructor(public readonly result: Result<unknown>) {
    super("rollback");
  }
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}
