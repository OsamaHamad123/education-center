"use server";

import { createAction } from "@/shared/actions/create-action";
import type { Subject } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import {
  countSlotsUsingSubject,
  findSubjectById,
  findSubjectByName,
  insertSubject,
  updateSubject,
} from "../../infrastructure/subjects.repository";
import { createSubjectSchema, setSubjectActiveSchema, updateSubjectSchema } from "../schemas";

/**
 * Subjects are a global list (PROJECT_PLAN 7.4), so these are super-admin only and
 * need no branch — hence `requireBranch: false`.
 *
 * There is no delete: sessions snapshot the subject name for historical accuracy, and
 * a subject still referenced by a timetable slot is deactivated, never removed.
 */

export const createSubject = createAction({
  permission: "subject.manage",
  schema: createSubjectSchema,
  requireBranch: false,
  audit: { action: "create", entity: "subject", entityId: (s: Subject) => s.id },
  revalidate: { paths: ["/subjects"] },
  handler: async ({ tx, ctx, input }) => {
    if (await findSubjectByName(ctx, tx, input.name)) {
      return err("CONFLICT", ar.subjects.nameTaken, { name: [ar.subjects.nameTaken] });
    }
    return ok(await insertSubject(ctx, tx, input.name));
  },
});

export const renameSubject = createAction({
  permission: "subject.manage",
  schema: updateSubjectSchema,
  requireBranch: false,
  audit: { action: "update", entity: "subject", entityId: (s: Subject) => s.id },
  revalidate: { paths: ["/subjects"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findSubjectById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    if (input.name !== existing.name && (await findSubjectByName(ctx, tx, input.name, input.id))) {
      return err("CONFLICT", ar.subjects.nameTaken, { name: [ar.subjects.nameTaken] });
    }

    const updated = await updateSubject(ctx, tx, input.id, { name: input.name });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const setSubjectActive = createAction({
  permission: "subject.manage",
  schema: setSubjectActiveSchema,
  requireBranch: false,
  audit: { action: "update", entity: "subject.status", entityId: (s: Subject) => s.id },
  revalidate: { paths: ["/subjects"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findSubjectById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    // Deactivating a subject that classes are still scheduled to study would leave
    // the timetable pointing at something the admin can no longer pick.
    if (!input.isActive && (await countSlotsUsingSubject(ctx, tx, input.id)) > 0) {
      return err("CONFLICT", ar.subjects.inUse);
    }

    const updated = await updateSubject(ctx, tx, input.id, { isActive: input.isActive });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});
