/**
 * Public API of the `assessments` module — الدرجات.
 *
 * Other modules may import from this file ONLY. Never deep-import
 * `src/modules/assessments/domain|application|infrastructure|ui` from outside.
 */
export { checkAssessment, checkPublish, publishState, type PublishState } from "./domain/assessment";
export { checkScore, planScores, summarizeScores, type ScoreSummary } from "./domain/scoring";

export {
  getAssessments,
  getScoreSheet,
  getStudentMarks,
  type AssessmentList,
  type AssessmentListRow,
  type ScoreSheet,
  type StudentMarks,
} from "./application/queries/get-assessments";

export {
  archiveAssessment,
  createAssessment,
  editAssessment,
  publishAssessment,
} from "./application/use-cases/manage-assessment";
export { saveScores, type SaveScoresResult } from "./application/use-cases/save-scores";

/**
 * One repository function on the module's public face, for the same reason the
 * attendance module exposes two: the isolation test runs against the database as the
 * app role and has no session to go through the application's door with.
 */
export { findAssessmentById, type AssessmentRow } from "./infrastructure/assessments.repository";

export { AssessmentsTable } from "./ui/assessments-table";
export { AssessmentDialog } from "./ui/assessment-dialog";
export { ScoreSheetScreen } from "./ui/score-sheet";
export { StudentMarksList } from "./ui/student-marks";
export { ScoreSheetPrint } from "./ui/score-sheet-print";
