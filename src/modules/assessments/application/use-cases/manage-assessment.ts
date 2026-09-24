"use server";

import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { checkAssessment, checkPublish } from "../../domain/assessment";
import {
  countScores,
  findAssessmentById,
  findClassBranch,
  insertAssessment,
  listSubjectOptions,
  listTaughtClasses,
  updateAssessment,
} from "../../infrastructure/assessments.repository";
import {
  archiveAssessmentSchema,
  createAssessmentSchema,
  editAssessmentSchema,
  publishAssessmentSchema,
} from "../schemas";

/**
 * Creating, editing, publishing and archiving an assessment (`drizzle/0021`).
 *
 * Creating is `assessment.mark` — a teacher who gave a quiz on Sunday should not have
 * to ask the office to open a row before entering the marks. Which class they may open
 * one FOR is the database's answer: `assessments_insert` admits a teacher only for a
 * class on their own timetable.
 *
 * Publishing is `assessment.publish`, and it is not the teacher's. It is the moment a
 * result leaves the building, and the office is who answers the phone afterwards.
 */

const REVALIDATE = ["/assessments", "/teacher/assessments", "/portal"];

export const createAssessment = createAction({
  permission: "assessment.mark",
  schema: createAssessmentSchema,
  audit: { action: "create", entity: "assessment", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: REVALIDATE },
  handler: async ({ tx, ctx, input }) => {
    const violation = checkAssessment({
      name: input.name,
      maxScoreHundredths: input.maxScore,
      assessedOn: input.assessedOn,
      today: todayInCairo(),
    });
    if (violation) return err("VALIDATION_ERROR", ar.assessments.violations[violation]);

    // The branch comes from the CLASS, never from the client — and a class in another
    // branch is invisible under RLS, so a forged id is a 404 rather than a 403.
    const classRef = await findClassBranch(ctx, tx, input.classId);
    if (!classRef) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const subject = (await listSubjectOptions(ctx, tx)).find((row) => row.id === input.subjectId);
    if (!subject) return err("NOT_FOUND", ar.assessments.noSuchSubject);

    // A teacher may only ever open one for themselves. The RLS policy says so too;
    // this says it in Arabic first, and stops a teacher silently creating a paper in
    // a colleague's name.
    if (ctx.role === "teacher") {
      if (ctx.teacherId !== input.teacherId) return err("FORBIDDEN", ar.assessments.notYourAssessment);
      const taught = await listTaughtClasses(ctx, tx, input.teacherId);
      if (!taught.some((row) => row.id === input.classId)) {
        return err("FORBIDDEN", ar.assessments.notYourClass);
      }
    }

    const row = await insertAssessment(ctx, tx, {
      branchId: classRef.branchId,
      classId: input.classId,
      subjectId: input.subjectId,
      teacherId: input.teacherId,
      name: input.name.trim(),
      kind: input.kind,
      assessedOn: input.assessedOn,
      maxScoreHundredths: input.maxScore,
    });
    return ok(row);
  },
});

/**
 * Editing the paper's own details.
 *
 * The TOTAL is deliberately not editable. Every mark already carries its own snapshot
 * of what it was marked out of, so changing it here would leave a sheet where half the
 * rows mean one thing and half mean another. An exam marked out of the wrong total is
 * archived and entered again — which is also the honest record of what happened.
 */
export const editAssessment = createAction({
  permission: "assessment.mark",
  schema: editAssessmentSchema,
  audit: { action: "update", entity: "assessment", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: REVALIDATE },
  handler: async ({ tx, ctx, input }) => {
    const assessment = await findAssessmentById(ctx, tx, input.assessmentId);
    if (!assessment) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (ctx.role === "teacher" && assessment.teacherId !== ctx.teacherId) {
      return err("FORBIDDEN", ar.assessments.notYourAssessment);
    }

    const violation = checkAssessment({
      name: input.name,
      maxScoreHundredths: assessment.maxScoreHundredths,
      assessedOn: input.assessedOn,
      today: todayInCairo(),
    });
    if (violation) return err("VALIDATION_ERROR", ar.assessments.violations[violation]);

    const row = await updateAssessment(ctx, tx, input.assessmentId, {
      name: input.name.trim(),
      kind: input.kind,
      assessedOn: input.assessedOn,
    });
    if (!row) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(row);
  },
});

/**
 * Showing a paper to parents, or taking it back.
 *
 * Withdrawing is allowed on purpose: a mark published by mistake has to be stoppable,
 * and "it is already out there" is not a reason to leave it out there. The audit log
 * keeps both acts.
 */
export const publishAssessment = createAction({
  permission: "assessment.publish",
  schema: publishAssessmentSchema,
  audit: { action: "update", entity: "assessment.publish", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: REVALIDATE },
  handler: async ({ tx, ctx, input }) => {
    const assessment = await findAssessmentById(ctx, tx, input.assessmentId);
    if (!assessment) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const problem = checkPublish({
      publishedAt: assessment.publishedAt,
      scoredCount: await countScores(ctx, tx, input.assessmentId),
      publish: input.publish,
    });
    if (problem) return err("CONFLICT", ar.assessments.publishViolations[problem]);

    const row = await updateAssessment(ctx, tx, input.assessmentId, {
      publishedAt: input.publish ? new Date() : null,
    });
    if (!row) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(row);
  },
});

/**
 * Archiving, not deleting: this product does not erase records of children, and a
 * paper that was entered by mistake still happened to somebody.
 *
 * It unpublishes at the same time — an archived paper that parents can still see would
 * be a record the centre believes is gone and families can still read.
 */
export const archiveAssessment = createAction({
  permission: "assessment.manage",
  schema: archiveAssessmentSchema,
  audit: { action: "archive", entity: "assessment", entityId: (out: { id: string }) => out.id },
  revalidate: { paths: REVALIDATE },
  handler: async ({ tx, ctx, input }) => {
    const assessment = await findAssessmentById(ctx, tx, input.assessmentId);
    if (!assessment) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (!assessment.isActive) return err("CONFLICT", ar.assessments.alreadyArchived);

    const row = await updateAssessment(ctx, tx, input.assessmentId, {
      isActive: false,
      publishedAt: null,
    });
    if (!row) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    return ok(row);
  },
});
