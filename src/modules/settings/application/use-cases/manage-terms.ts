"use server";

import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { createAction } from "@/shared/actions/create-action";
import { academicTerms } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { checkTerm } from "../../domain/terms";

/**
 * The centre's academic calendar (§16 question 7).
 *
 * `requireBranch: false` on all three: a term belongs to the centre, not to a branch,
 * and a super admin is usually in "كافة الفروع" when they set one.
 *
 * Deleting is allowed here, unusually for this codebase. A term is a LABEL on a
 * calendar, not a record of something that happened: nothing is stored against a term
 * id — attendance, invoices and payslips are all stored against dates — so removing one
 * mistyped in September changes no figure anywhere.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح");

const termSchema = z.object({
  name: z.string().trim().min(2, "اسم الفصل مطلوب").max(80, "الاسم طويل جداً"),
  startDate: isoDate,
  endDate: isoDate,
});

const editSchema = termSchema.extend({ id: z.uuid("معرّف غير صالح") });
const idSchema = z.object({ id: z.uuid("معرّف غير صالح") });

const REVALIDATE = { paths: ["/settings", "/reports"] };

export const createTerm = createAction({
  permission: "settings.manage",
  schema: termSchema,
  requireBranch: false,
  audit: { action: "create", entity: "academic_term", entityId: (out: { id: string }) => out.id },
  revalidate: REVALIDATE,
  handler: async ({ tx, ctx, input }) => {
    const problem = checkTerm(input, await allTerms(tx));
    if (problem) return err("CONFLICT", ar.terms.problems[problem]);

    const [row] = await tx
      .insert(academicTerms)
      .values({ ...input, createdBy: ctx.userId })
      .returning({ id: academicTerms.id });
    if (!row) return err("INTERNAL", ar.errors.INTERNAL);
    return ok(row);
  },
});

export const editTerm = createAction({
  permission: "settings.manage",
  schema: editSchema,
  requireBranch: false,
  audit: { action: "update", entity: "academic_term", entityId: (out: { id: string }) => out.id },
  revalidate: REVALIDATE,
  handler: async ({ tx, input }) => {
    const problem = checkTerm(input, await allTerms(tx));
    if (problem) return err("CONFLICT", ar.terms.problems[problem]);

    const [row] = await tx
      .update(academicTerms)
      .set({ name: input.name, startDate: input.startDate, endDate: input.endDate })
      .where(eq(academicTerms.id, input.id))
      .returning({ id: academicTerms.id });
    if (!row) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(row);
  },
});

export const deleteTerm = createAction({
  permission: "settings.manage",
  schema: idSchema,
  requireBranch: false,
  audit: { action: "delete", entity: "academic_term", entityId: (out: { id: string }) => out.id },
  revalidate: REVALIDATE,
  handler: async ({ tx, input }) => {
    const [row] = await tx
      .delete(academicTerms)
      .where(eq(academicTerms.id, input.id))
      .returning({ id: academicTerms.id });
    if (!row) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(row);
  },
});

/** Every term, for the overlap check. A centre has a handful, not a table full. */
async function allTerms(tx: Parameters<Parameters<typeof createAction>[0]["handler"]>[0]["tx"]) {
  return tx
    .select({
      id: academicTerms.id,
      name: academicTerms.name,
      startDate: academicTerms.startDate,
      endDate: academicTerms.endDate,
    })
    .from(academicTerms)
    .orderBy(asc(academicTerms.startDate));
}
