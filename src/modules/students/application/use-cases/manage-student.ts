"use server";

import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { findLikelyDuplicates } from "../../domain/duplicate";
import {
  planArchive,
  planBranchTransfer,
  planClassChange,
  planInitialEnrollment,
  planRestore,
  type EnrollmentPlan,
  type StudentState,
  type TransitionError,
} from "../../domain/enrollment";
import { academicYearOf, formatStudentCode } from "../../domain/student-code";
import {
  closeEnrollment,
  findBranchCode,
  findClassBranch,
  findDuplicateCandidates,
  findOpenEnrollment,
  findStudentById,
  insertStudent,
  nextStudentSequence,
  openEnrollment,
  updateStudent,
} from "../../infrastructure/students.repository";
import {
  archiveStudentSchema,
  changeClassSchema,
  createStudentSchema,
  restoreStudentSchema,
  transferBranchSchema,
  updateStudentSchema,
} from "../schemas";

/** Domain refusals become the Arabic sentence the user reads. */
const TRANSITION_MESSAGES: Record<TransitionError, string> = {
  STUDENT_ARCHIVED: ar.students.errors.archived,
  STUDENT_ALREADY_ACTIVE: ar.students.errors.alreadyActive,
  NO_OPEN_ENROLLMENT: ar.students.errors.noOpenEnrollment,
  SAME_CLASS: ar.students.errors.sameClass,
  SAME_BRANCH: ar.students.errors.sameBranch,
  CLASS_NOT_IN_BRANCH: ar.students.errors.classNotInBranch,
  REASON_REQUIRED: ar.students.errors.reasonRequired,
  DATE_BEFORE_START: ar.students.errors.dateBeforeStart,
};

/** Applies a plan the domain produced. The only place enrollment rows are written. */
async function applyPlan(ctx: TenantContext, tx: Tx, studentId: string, plan: EnrollmentPlan): Promise<void> {
  // Close before opening: the partial unique index allows only one open row at a time.
  if (plan.close) {
    await closeEnrollment(ctx, tx, plan.close.enrollmentId, plan.close.endDate, plan.close.endReason);
  }
  if (plan.open) {
    await openEnrollment(ctx, tx, { studentId, ...plan.open });
  }
  if (Object.keys(plan.student).length > 0) {
    await updateStudent(ctx, tx, studentId, plan.student);
  }
}

async function loadState(ctx: TenantContext, tx: Tx, id: string): Promise<StudentState | null> {
  const student = await findStudentById(ctx, tx, id);
  if (!student) return null;
  const current = await findOpenEnrollment(ctx, tx, id);
  return {
    status: student.status,
    branchId: student.branchId,
    classId: student.classId,
    current: current
      ? {
          id: current.id,
          branchId: current.branchId,
          classId: current.classId,
          startDate: current.startDate,
        }
      : null,
  };
}

export const createStudent = createAction({
  permission: "student.write",
  schema: createStudentSchema,
  audit: { action: "create", entity: "student", entityId: (s: { id: string }) => s.id },
  revalidate: { paths: ["/students", "/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const branchId = ctx.branchId;
    if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

    const klass = await findClassBranch(ctx, tx, input.classId);
    if (!klass || klass.branchId !== branchId) {
      return err("VALIDATION_ERROR", ar.students.errors.classNotInBranch, {
        classId: [ar.students.errors.classNotInBranch],
      });
    }

    // A warning, never a block (rule 10.3): brothers share a surname and a phone.
    if (!input.confirmDuplicate) {
      const candidates = await findDuplicateCandidates(ctx, tx, branchId, input.parentPhone);
      const duplicates = findLikelyDuplicates(
        { fullName: input.fullName, parentPhone: input.parentPhone },
        candidates,
      );
      if (duplicates.length > 0) {
        return err("CONFLICT", ar.students.errors.possibleDuplicate, {
          _duplicates: duplicates.map((d) => `${d.studentCode} — ${d.fullName} (${d.className})`),
        });
      }
    }

    const branchCode = await findBranchCode(ctx, tx, branchId);
    if (!branchCode) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    const year = academicYearOf(input.joinDate);
    const sequence = await nextStudentSequence(ctx, tx, branchId, year);

    const student = await insertStudent(ctx, tx, {
      studentCode: formatStudentCode({ branchCode, year, sequence }),
      fullName: input.fullName,
      studentPhone: input.studentPhone,
      studentWhatsapp: input.studentWhatsapp,
      parentPhone: input.parentPhone,
      parentWhatsapp: input.parentWhatsapp,
      nationalId: input.nationalId,
      branchId,
      classId: input.classId,
      joinDate: input.joinDate,
    });

    const plan = planInitialEnrollment({
      branchId,
      classId: input.classId,
      joinDate: input.joinDate,
    });
    if (plan.open) await openEnrollment(ctx, tx, { studentId: student.id, ...plan.open });

    return ok(student);
  },
});

export const editStudent = createAction({
  permission: "student.write",
  schema: updateStudentSchema,
  audit: { action: "update", entity: "student", entityId: (s: { id: string }) => s.id },
  revalidate: { paths: ["/students"] },
  handler: async ({ tx, ctx, input }) => {
    const existing = await findStudentById(ctx, tx, input.id);
    if (!existing) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const updated = await updateStudent(ctx, tx, input.id, {
      fullName: input.fullName,
      studentPhone: input.studentPhone,
      studentWhatsapp: input.studentWhatsapp,
      parentPhone: input.parentPhone,
      parentWhatsapp: input.parentWhatsapp,
      nationalId: input.nationalId,
    });
    if (!updated) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(updated);
  },
});

export const changeStudentClass = createAction({
  permission: "student.write",
  schema: changeClassSchema,
  audit: { action: "update", entity: "student.class", entityId: (s: { id: string }) => s.id },
  revalidate: { paths: ["/students", "/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const state = await loadState(ctx, tx, input.id);
    if (!state) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const klass = await findClassBranch(ctx, tx, input.classId);
    if (!klass) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const result = planClassChange(state, {
      classId: input.classId,
      classBranchId: klass.branchId,
      onDate: input.onDate,
    });
    if (!result.ok) return err("CONFLICT", TRANSITION_MESSAGES[result.error]);

    await applyPlan(ctx, tx, input.id, result.plan);
    return ok({ id: input.id });
  },
});

export const transferStudentBranch = createAction({
  permission: "student.transfer_branch",
  schema: transferBranchSchema,
  // A transfer moves the student OUT of the selected branch, so it cannot be scoped
  // to one; the RLS policy allows it for a super admin with any branch selected.
  audit: { action: "transfer", entity: "student.branch", entityId: (s: { id: string }) => s.id },
  revalidate: { paths: ["/students", "/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const state = await loadState(ctx, tx, input.id);
    if (!state) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const klass = await findClassBranch(ctx, tx, input.classId);
    if (!klass) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const result = planBranchTransfer(state, {
      branchId: input.branchId,
      classId: input.classId,
      classBranchId: klass.branchId,
      onDate: input.onDate,
    });
    if (!result.ok) return err("CONFLICT", TRANSITION_MESSAGES[result.error]);

    await applyPlan(ctx, tx, input.id, result.plan);
    return ok({ id: input.id });
  },
});

export const archiveStudent = createAction({
  permission: "student.archive",
  schema: archiveStudentSchema,
  audit: { action: "archive", entity: "student", entityId: (s: { id: string }) => s.id },
  revalidate: { paths: ["/students", "/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const state = await loadState(ctx, tx, input.id);
    if (!state) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const result = planArchive(state, {
      leftDate: input.leftDate,
      leaveReason: input.leaveReason,
    });
    if (!result.ok) return err("CONFLICT", TRANSITION_MESSAGES[result.error]);

    await applyPlan(ctx, tx, input.id, result.plan);
    return ok({ id: input.id });
  },
});

export const restoreStudent = createAction({
  permission: "student.archive",
  schema: restoreStudentSchema,
  audit: { action: "restore", entity: "student", entityId: (s: { id: string }) => s.id },
  revalidate: { paths: ["/students", "/classes"] },
  handler: async ({ tx, ctx, input }) => {
    const state = await loadState(ctx, tx, input.id);
    if (!state) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const klass = await findClassBranch(ctx, tx, input.classId);
    if (!klass) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const result = planRestore(state, {
      classId: input.classId,
      classBranchId: klass.branchId,
      onDate: input.onDate || todayInCairo(),
    });
    if (!result.ok) return err("CONFLICT", TRANSITION_MESSAGES[result.error]);

    await applyPlan(ctx, tx, input.id, result.plan);
    return ok({ id: input.id });
  },
});
