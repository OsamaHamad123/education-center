"use server";

import { createAction } from "@/shared/actions/create-action";
import type { Class } from "@/shared/db/schema";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { canChangeTrack, canDeactivateClass } from "../../domain/rules";
import {
  countActiveStudentsInClass,
  countSessionsForClass,
  findClassById,
  findClassByName,
  insertClass,
  updateClass,
} from "../../infrastructure/classes.repository";
import { createClassSchema, setClassActiveSchema, updateClassSchema } from "../schemas";

/**
 * Class management (PROJECT_PLAN 10.2). Unlike branches these ARE branch-scoped, so
 * `requireBranch` stays on: a super admin in "كافة الفروع" mode has no branch to
 * create a class in, and createAction refuses with BRANCH_REQUIRED.
 */

export const createClass = createAction({
  permission: "class.write",
  schema: createClassSchema,
  audit: { action: "create", entity: "class", entityId: (c: Class) => c.id },
  revalidate: { paths: ["/classes"] },
  handler: async ({ tx, ctx, input }) => {
    // Non-null: createAction guarantees a branch when requireBranch is on.
    const branchId = ctx.branchId;
    if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    if (await findClassByName(ctx, tx, branchId, input.name)) {
      return err("CONFLICT", ar.classes.nameTaken, { name: [ar.classes.nameTaken] });
    }

    return ok(await insertClass(ctx, tx, { ...input, branchId }));
  },
});

export const editClass = createAction({
  permission: "class.write",
  schema: updateClassSchema,
  audit: { action: "update", entity: "class", entityId: (c: Class) => c.id },
  revalidate: { paths: ["/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findClassById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    // Rule 10.2: sessions snapshot the track and the rate that goes with it.
    if (input.track !== existing.track) {
      const sessionCount = await countSessionsForClass(ctx, tx, input.id);
      if (canChangeTrack({ sessionCount })) {
        return err("CONFLICT", ar.classes.trackLocked, { track: [ar.classes.trackLocked] });
      }
    }

    if (
      input.name !== existing.name &&
      (await findClassByName(ctx, tx, existing.branchId, input.name, input.id))
    ) {
      return err("CONFLICT", ar.classes.nameTaken, { name: [ar.classes.nameTaken] });
    }

    const updated = await updateClass(ctx, tx, input.id, {
      name: input.name,
      track: input.track,
      gender: input.gender,
      gradeLevel: input.gradeLevel,
    });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const setClassActive = createAction({
  permission: "class.write",
  schema: setClassActiveSchema,
  audit: { action: "update", entity: "class.status", entityId: (c: Class) => c.id },
  revalidate: { paths: ["/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findClassById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    if (!input.isActive) {
      const violation = canDeactivateClass({
        activeStudentCount: await countActiveStudentsInClass(ctx, tx, input.id),
        isCurrentlyActive: existing.isActive,
      });
      if (violation === "HAS_ACTIVE_STUDENTS") return err("CONFLICT", ar.classes.hasStudents);
      if (violation === "ALREADY_INACTIVE") return err("CONFLICT", ar.classes.alreadyInactive);
    }

    const updated = await updateClass(ctx, tx, input.id, { isActive: input.isActive });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});
