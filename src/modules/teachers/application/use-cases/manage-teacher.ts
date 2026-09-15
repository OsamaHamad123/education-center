"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { generateAccessCode } from "../../domain/access-code";
import { ratesChanged, validateRates } from "../../domain/rates";
import {
  findTeacherById,
  findTeacherByPhone,
  findTeacherUser,
  insertTeacher,
  insertTeacherAccount,
  linkTeacherToBranch,
  lookupTeacherIdForLinking,
  recordRateChange,
  resetTeacherPassword,
  setBranchLinkActive,
  setTeacherUserActive,
  updateTeacher,
} from "../../infrastructure/teachers.repository";
import {
  createTeacherSchema,
  linkTeacherSchema,
  setBranchLinkSchema,
  setTeacherStatusSchema,
  teacherIdSchema,
  updateTeacherSchema,
} from "../schemas";

/**
 * Teachers (PROJECT_PLAN 7.7–7.9, section 3).
 *
 * A teacher is a GLOBAL profile — the same person may teach in three branches — so
 * creating one and setting rates is super-admin work and needs no branch selected.
 * Linking an existing teacher to a branch is the one thing a branch admin may do, and
 * that one IS branch-scoped.
 *
 * The access code is shown exactly once. It is never stored readable and never
 * written to the audit log; the log records that a reset happened, not its result.
 */

function newAccessCode(): string {
  return generateAccessCode(randomBytes(64));
}

/** The schema names its fields after the DB columns; the domain speaks in tracks. */
function ratesOf(input: { ratePiastersScientific: number; ratePiastersLiterary: number }) {
  return {
    scientificPiasters: input.ratePiastersScientific,
    literaryPiasters: input.ratePiastersLiterary,
  };
}

export const createTeacher = createAction({
  permission: "teacher.manage",
  schema: createTeacherSchema,
  requireBranch: false,
  audit: { action: "create", entity: "teacher", entityId: (r: { id: string }) => r.id },
  revalidate: { paths: ["/teachers"] },
  handler: async ({ tx, ctx, input }) => {
    if (validateRates(ratesOf(input))) return err("VALIDATION_ERROR", ar.teachers.invalidRates);

    if (await findTeacherByPhone(ctx, tx, input.phone)) {
      return err("CONFLICT", ar.teachers.phoneTaken, { phone: [ar.teachers.phoneTaken] });
    }

    const teacher = await insertTeacher(ctx, tx, {
      fullName: input.fullName,
      phone: input.phone,
      specialization: input.specialization,
      ratePiastersScientific: input.ratePiastersScientific,
      ratePiastersLiterary: input.ratePiastersLiterary,
    });

    // The opening rate belongs in the trail too, so "what were they on in March?"
    // has an answer from day one.
    await recordRateChange(ctx, tx, {
      teacherId: teacher.id,
      ratePiastersScientific: input.ratePiastersScientific,
      ratePiastersLiterary: input.ratePiastersLiterary,
      effectiveFrom: todayInCairo(),
    });

    if (input.branchId) {
      await linkTeacherToBranch(ctx, tx, teacher.id, input.branchId);
    }

    const accessCode = newAccessCode();
    await insertTeacherAccount(ctx, tx, {
      userId: `usr_t_${randomUUID()}`,
      name: teacher.fullName,
      phone: teacher.phone,
      passwordHash: await hashPassword(accessCode),
    });

    return ok({ id: teacher.id, phone: teacher.phone, accessCode });
  },
});

export const editTeacher = createAction({
  permission: "teacher.manage",
  schema: updateTeacherSchema,
  requireBranch: false,
  audit: { action: "update", entity: "teacher", entityId: (r: { id: string }) => r.id },
  revalidate: { paths: ["/teachers"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findTeacherById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (validateRates(ratesOf(input))) return err("VALIDATION_ERROR", ar.teachers.invalidRates);

    const moved = ratesChanged(ratesOf(existing), ratesOf(input));

    const updated = await updateTeacher(ctx, tx, input.id, {
      fullName: input.fullName,
      specialization: input.specialization,
      ratePiastersScientific: input.ratePiastersScientific,
      ratePiastersLiterary: input.ratePiastersLiterary,
    });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    // Only a real change earns a history row — an idle save should not add noise.
    // Past sessions keep their own snapshot regardless (rule 10.6).
    if (moved) {
      await recordRateChange(ctx, tx, {
        teacherId: input.id,
        ratePiastersScientific: input.ratePiastersScientific,
        ratePiastersLiterary: input.ratePiastersLiterary,
        effectiveFrom: input.effectiveFrom,
      });
    }

    return ok({ id: input.id, rateChanged: moved });
  },
});

export const setTeacherStatus = createAction({
  permission: "teacher.manage",
  schema: setTeacherStatusSchema,
  requireBranch: false,
  audit: { action: "update", entity: "teacher.status", entityId: (r: { id: string }) => r.id },
  revalidate: { paths: ["/teachers"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findTeacherById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (existing.status === input.status) return err("CONFLICT", ar.teachers.statusUnchanged);

    await updateTeacher(ctx, tx, input.id, { status: input.status });
    // Deactivating the profile must also close the door on their login.
    await setTeacherUserActive(ctx, tx, input.id, input.status === "active");

    return ok({ id: input.id, status: input.status });
  },
});

export const resetTeacherAccessCode = createAction({
  permission: "teacher.manage",
  schema: teacherIdSchema,
  requireBranch: false,
  audit: { action: "update", entity: "teacher.access_code", entityId: (r: { id: string }) => r.id },
  revalidate: { paths: ["/teachers"] },
  handler: async ({ tx, ctx, input }) => {
    const teacher = await findTeacherById(ctx, tx, input.id);
    if (!teacher) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const found = await findTeacherUser(ctx, tx, input.id);
    if (!found) return err("NOT_FOUND", ar.teachers.noAccount);

    const accessCode = newAccessCode();
    await resetTeacherPassword(ctx, tx, found.id, await hashPassword(accessCode));

    return ok({ id: input.id, phone: teacher.phone, accessCode });
  },
});

/**
 * Links an existing teacher to the caller's branch, by phone (section 3).
 *
 * The lookup goes through a SECURITY DEFINER function because a branch admin cannot
 * yet see the teacher — see drizzle/0004 for why that is deliberate and how narrow it
 * is. After the link, the normal policy makes the teacher visible to them.
 */
export const linkTeacherByPhone = createAction({
  permission: "teacher.link_branch",
  schema: linkTeacherSchema,
  audit: { action: "create", entity: "teacher.branch_link", entityId: (r: { id: string }) => r.id },
  revalidate: { paths: ["/teachers"] },
  handler: async ({ tx, ctx, input }) => {
    const branchId = ctx.branchId;
    if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const teacherId = await lookupTeacherIdForLinking(ctx, tx, input.phone);
    // The same answer whether no teacher has that number or they are inactive —
    // there is nothing useful to distinguish for the person at the desk.
    if (!teacherId) return err("NOT_FOUND", ar.teachers.notFoundByPhone);

    await linkTeacherToBranch(ctx, tx, teacherId, branchId);

    // Readable now that the link exists.
    const teacher = await findTeacherById(ctx, tx, teacherId);
    return ok({ id: teacherId, fullName: teacher?.fullName ?? "" });
  },
});

export const setTeacherBranchLink = createAction({
  permission: "teacher.link_branch",
  schema: setBranchLinkSchema,
  audit: { action: "update", entity: "teacher.branch_link", entityId: (r: { id: string }) => r.id },
  revalidate: { paths: ["/teachers"] },
  handler: async ({ tx, ctx, input }) => {
    // A branch admin may only touch their own branch's link; RLS enforces it too.
    if (ctx.role === "branch_admin" && input.branchId !== ctx.branchId) {
      return err("FORBIDDEN", ar.errors.FORBIDDEN);
    }

    await setBranchLinkActive(ctx, tx, input.id, input.branchId, input.isActive);
    return ok({ id: input.id });
  },
});
