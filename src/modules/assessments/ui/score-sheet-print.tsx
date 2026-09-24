import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { formatScore, scorePercent } from "@/shared/lib/score";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { ScoreSheet } from "../application/queries/get-assessments";

/**
 * كشف درجات on A4 portrait (PROJECT_PLAN section 12).
 *
 * Portrait, unlike the attendance register: this is one column of marks, not a month
 * of them. Blank rows print as blank — a sheet a teacher can finish by hand is the way
 * this centre has always worked, and the reason the register's print does the same.
 */
export function ScoreSheetPrint({
  sheet,
  centerName,
  logoPath,
  branchName,
}: {
  sheet: ScoreSheet;
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
}) {
  const { assessment } = sheet;

  return (
    <PrintSheet
      orientation="portrait"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={assessment.name}
      subtitle={`${assessment.className} — ${assessment.subjectName} · ${formatDisplayDate(assessment.assessedOn)} · ${ar.assessments.outOf} ${formatScore(assessment.maxScoreHundredths)}`}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-10 border p-2">
              #
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.assessments.student}
            </th>
            <th scope="col" className="w-24 border p-2">
              {ar.assessments.score}
            </th>
            <th scope="col" className="w-20 border p-2">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.students.map((student, index) => (
            <tr key={student.studentId}>
              <td className="border p-2 text-center">{index + 1}</td>
              <td className="border p-2">{student.fullName}</td>
              <td className="border p-2 text-center" dir="ltr">
                {student.didNotSit
                  ? ar.assessments.didNotSit
                  : student.scoreHundredths === null
                    ? ""
                    : formatScore(student.scoreHundredths)}
              </td>
              <td className="border p-2 text-center" dir="ltr">
                {student.didNotSit || student.scoreHundredths === null
                  ? ""
                  : `${scorePercent(student.scoreHundredths, assessment.maxScoreHundredths)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sheet.summary.averagePercent !== null ? (
        <p className="mt-3 text-xs">
          {ar.assessments.sat}: {sheet.summary.sat} · {ar.assessments.average}: {sheet.summary.averagePercent}
          % · {ar.assessments.highest}: {sheet.summary.highestPercent}% · {ar.assessments.lowest}:{" "}
          {sheet.summary.lowestPercent}%
        </p>
      ) : null}
    </PrintSheet>
  );
}
