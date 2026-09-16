"use server";

import { inArray } from "drizzle-orm";
import { z } from "zod";
import { requestMetadata, writeAuditLog } from "@/shared/actions/audit";
import { createAction } from "@/shared/actions/create-action";
import { students } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { CONTACT_ENTITY } from "../../infrastructure/reports.repository";

/**
 * Records that the office opened a conversation about these children (P4a).
 *
 * This is the half of P4a worth more than the templates. Without it the product has no
 * idea whether anybody has ever contacted a parent, so the office rings the same family
 * twice in a morning and misses another entirely, and the owner cannot tell whether the
 * absence report is being acted on at all.
 *
 * The record IS an audit row — there is no other table — under `action: 'contact'` and
 * `entity: 'student.contact'`, because the log is a thing you filter and a contact must
 * not be spelled as an 'update'. One row per CHILD rather than one per message, since
 * that is how the list reads it back: a sibling who shared a message must still show as
 * contacted. `createAction`'s own audit step takes a single entity id, so the rows are
 * written here with the same function it uses, inside the same transaction.
 *
 * The ids are checked against the tenant's own students first. A student from another
 * branch is simply not found by that query, so a forged id writes no row rather than
 * putting a foreign child's id into this branch's audit log.
 */
const recordContactSchema = z.object({
  studentIds: z.array(z.uuid()).min(1).max(20),
});

export const recordParentContact = createAction({
  permission: "report.read",
  schema: recordContactSchema,
  revalidate: { paths: ["/attendance/contact", "/reports/alerts"] },
  handler: async ({ tx, ctx, input }) => {
    const rows = await tx
      .select({ id: students.id })
      .from(students)
      .where(inArray(students.id, input.studentIds));

    if (rows.length === 0) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const request = await requestMetadata();
    for (const row of rows) {
      await writeAuditLog(tx, ctx, { action: "contact", entity: CONTACT_ENTITY, entityId: row.id }, request);
    }

    return ok({ contacted: rows.length });
  },
});
