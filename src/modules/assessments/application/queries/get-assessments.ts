import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { readDateRange, uuidParam } from "@/shared/lib/url-filters";
import { publishState, type PublishState } from "../../domain/assessment";
import { summarizeScores, type ScoreSummary } from "../../domain/scoring";
import {
  countScores,
  findAssessmentById,
  listAssessmentClasses,
  listAssessments,
  listRosterFor,
  listScores,
  listStudentMarks,
  listSubjectOptions,
  listTaughtClasses,
  listTeacherOptions,
  type AssessmentRow,
  type RosterStudent,
  type StudentMarkRow,
} from "../../infrastructure/assessments.repository";

/**
 * Reading assessments (`drizzle/0021`).
 *
 * Branch scoping is RLS's, not this file's — a branch admin sees their branch because
 * those are the rows they can read, and a teacher sees their own papers for the same
 * reason. There is no filter here anybody could be talked out of.
 */

const MAX_ROWS = 300;
const MAX_STUDENT_MARKS = 100;

export type AssessmentListRow = AssessmentRow & {
  state: PublishState;
  /** How many of the class have a mark. The reason a teacher opens this screen. */
  markedCount: number;
};

export type AssessmentList = {
  rows: AssessmentListRow[];
  range: { from: string; to: string };
  classId: string | null;
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; fullName: string }[];
  /** Whether the viewer may publish — the office, never the teacher. */
  canPublish: boolean;
  canManage: boolean;
  /** The teacher's own id, when a teacher is looking. */
  myTeacherId: string | null;
};

function defaultRange(): { from: string; to: string } {
  const today = todayInCairo();
  // The term so far. Marks are read by the month far more than by the week.
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

export async function getAssessments(input: {
  from?: string | undefined;
  to?: string | undefined;
  classId?: string | undefined;
  subjectId?: string | undefined;
}): Promise<Result<AssessmentList>> {
  const auth = await requirePermission("assessment.read");
  if (!auth.ok) return auth;

  const fallback = defaultRange();
  const parsed = readDateRange(input);
  const range = { from: parsed.from ?? fallback.from, to: parsed.to ?? fallback.to };
  const classId = uuidParam.parse(input.classId);
  const subjectId = uuidParam.parse(input.subjectId);

  return withTenant(auth.data, async (tx) => {
    const rows = await listAssessments(auth.data, tx, { ...range, classId, subjectId }, MAX_ROWS);

    // Counted per assessment rather than in one grouped query: the list is capped at
    // 300 and this keeps the repository functions single-purpose.
    const counts = await Promise.all(rows.map((row) => countScores(auth.data, tx, row.id)));

    const isTeacher = auth.data.role === "teacher";
    const branchId = auth.data.branchId;
    const [classes, subjects, teachers] = await Promise.all([
      isTeacher
        ? auth.data.teacherId
          ? listTaughtClasses(auth.data, tx, auth.data.teacherId)
          : Promise.resolve([])
        : branchId
          ? listAssessmentClasses(auth.data, tx, branchId)
          : Promise.resolve([]),
      listSubjectOptions(auth.data, tx),
      isTeacher ? Promise.resolve([]) : listTeacherOptions(auth.data, tx),
    ]);

    return ok({
      rows: rows.map((row, index) => ({
        ...row,
        state: publishState(row.publishedAt),
        markedCount: counts[index] ?? 0,
      })),
      range,
      classId: classId ?? null,
      classes,
      subjects,
      teachers,
      canPublish: auth.data.role !== "teacher",
      canManage: auth.data.role !== "teacher",
      myTeacherId: auth.data.teacherId,
    });
  });
}

export type ScoreSheetRow = RosterStudent & {
  scoreHundredths: number | null;
  didNotSit: boolean;
  notes: string | null;
};

export type ScoreSheet = {
  assessment: AssessmentRow;
  state: PublishState;
  students: ScoreSheetRow[];
  summary: ScoreSummary;
  /** Null when this viewer may write on this sheet; otherwise why not. */
  readOnly: boolean;
  canPublish: boolean;
};

export async function getScoreSheet(assessmentId: string): Promise<Result<ScoreSheet>> {
  const auth = await requirePermission("assessment.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const assessment = await findAssessmentById(auth.data, tx, assessmentId);
    // Another branch's paper simply does not exist as far as this request is concerned.
    if (!assessment) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const [roster, scores] = await Promise.all([
      listRosterFor(auth.data, tx, assessment.classId, assessment.assessedOn),
      listScores(auth.data, tx, assessment.id),
    ]);

    const byStudent = new Map(scores.map((row) => [row.studentId, row]));
    const students: ScoreSheetRow[] = roster.map((student) => {
      const score = byStudent.get(student.studentId);
      return {
        ...student,
        scoreHundredths: score?.scoreHundredths ?? null,
        didNotSit: score?.didNotSit ?? false,
        notes: score?.notes ?? null,
      };
    });

    const isTeacher = auth.data.role === "teacher";
    return ok({
      assessment,
      state: publishState(assessment.publishedAt),
      students,
      summary: summarizeScores(scores, roster.length),
      // An archived paper is a record, not a form. A teacher may write only on their
      // own; everything else is RLS's answer and this is the screen's.
      readOnly: !assessment.isActive || (isTeacher && assessment.teacherId !== auth.data.teacherId),
      canPublish: !isTeacher,
    });
  });
}

export type StudentMarks = { rows: StudentMarkRow[] };

/** One student's marks, for their profile in the admin product. */
export async function getStudentMarks(studentId: string): Promise<Result<StudentMarks>> {
  const auth = await requirePermission("assessment.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const rows = await listStudentMarks(auth.data, tx, studentId, MAX_STUDENT_MARKS);
    return ok({ rows });
  });
}
