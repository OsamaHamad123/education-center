"use server";

import { createAction } from "@/shared/actions/create-action";
import { ar } from "@/shared/i18n/ar";
import { err, ok } from "@/shared/lib/result";
import { planScores } from "../../domain/scoring";
import { findAssessmentById, listRosterFor, upsertScores } from "../../infrastructure/assessments.repository";
import { saveScoresSchema } from "../schemas";

export type SaveScoresResult = {
  assessmentId: string;
  /** How many rows were written. */
  saved: number;
  /** Roster students still without a mark — shown so nobody is quietly left out. */
  unmarked: number;
};

/**
 * Entering a sheet of marks (`drizzle/0021`).
 *
 * The ROSTER decides who may be marked, not the payload — the same rule the register
 * follows and for the same reason: a mark carries its branch from the assessment, so
 * RLS alone would accept a row attached to a child in another branch. `planScores`
 * drops anybody who is not enrolled in this class on the day the paper was sat.
 *
 * Students the sheet did not send are left UNMARKED rather than defaulted. An unmarked
 * register means everybody was present; an unmarked exam means nothing at all, and a
 * zero invented here is a result a parent would read.
 */
export const saveScores = createAction({
  permission: "assessment.mark",
  schema: saveScoresSchema,
  audit: {
    action: "update",
    entity: "assessment.scores",
    entityId: (out: SaveScoresResult) => out.assessmentId,
  },
  revalidate: { paths: ["/assessments", "/teacher/assessments", "/portal"] },
  handler: async ({ tx, ctx, input }) => {
    const assessment = await findAssessmentById(ctx, tx, input.assessmentId);
    // An assessment in another branch is invisible under RLS: 404, not 403.
    if (!assessment) return err("NOT_FOUND", ar.errors.NOT_FOUND);
    if (!assessment.isActive) return err("CONFLICT", ar.assessments.alreadyArchived);
    if (ctx.role === "teacher" && assessment.teacherId !== ctx.teacherId) {
      return err("FORBIDDEN", ar.assessments.notYourAssessment);
    }

    // The enrolment that covered the day the paper was SAT, not today's class list.
    const roster = await listRosterFor(ctx, tx, assessment.classId, assessment.assessedOn);
    const rosterIds = new Set(roster.map((row) => row.studentId));

    const plan = planScores(rosterIds, input.scores, assessment.maxScoreHundredths);
    if (plan.violation) {
      return err("VALIDATION_ERROR", ar.assessments.scoreViolations[plan.violation.reason], {
        [`score:${plan.violation.studentId}`]: [ar.assessments.scoreViolations[plan.violation.reason]],
      });
    }

    const saved = await upsertScores(
      ctx,
      tx,
      assessment.id,
      assessment.branchId,
      assessment.maxScoreHundredths,
      plan.upserts,
    );

    return ok({ assessmentId: assessment.id, saved, unmarked: plan.skipped.length });
  },
});
