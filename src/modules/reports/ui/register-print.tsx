import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { ClassMatrixReport } from "../application/queries/get-reports";

/**
 * كشف الحضور والغياب on A4 landscape — the paper the centre already keeps
 * (photographs, 2026-09-24).
 *
 * Landscape and not portrait, because the grid is wide by nature: a month of six
 * teaching days a week with two periods a day is around fifty columns, and the paper
 * version handles it by being turned sideways and printed small.
 *
 * The header is two rows, exactly as the photographs show: the date across the top,
 * spanning however many lessons ran that day, and the period number beneath it. That
 * is the whole reason this exists as its own sheet rather than as the old day grid —
 * the day grid could not say which of Sunday's two periods a girl missed, and the
 * paper always could.
 *
 * A serial column is added on the left, because the paper has one and because a
 * register read aloud is read by number.
 */
export function RegisterPrint({
  report,
  centerName,
  logoPath,
  branchName,
  className,
}: {
  report: ClassMatrixReport;
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
  className: string | null;
}) {
  return (
    <PrintSheet
      orientation="landscape"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={ar.print.register}
      subtitle={`${className ? `${className} — ` : ""}${formatDisplayDate(report.range.from)} — ${formatDisplayDate(report.range.to)}`}
    >
      {report.columns.length === 0 ? (
        <p className="text-sm">{ar.reports.noSessions}</p>
      ) : (
        <>
          {/*
            8px, and deliberately: a month of lessons does not fit at any size a screen
            would use, and the paper register this copies is printed smaller still.
          */}
          <table className="w-full border-collapse text-[8px]">
            <thead>
              <tr>
                <th scope="col" rowSpan={2} className="border p-1">
                  #
                </th>
                <th scope="col" rowSpan={2} className="border p-1 text-start">
                  {ar.reports.student}
                </th>
                {report.days.map((day) => (
                  <th
                    key={day.sessionDate}
                    scope="col"
                    colSpan={day.periods}
                    className="border p-1 whitespace-nowrap"
                  >
                    {day.sessionDate.slice(8, 10)}/{day.sessionDate.slice(5, 7)}
                  </th>
                ))}
                <th scope="col" rowSpan={2} className="border p-1">
                  {ar.attendanceStatus.absent}
                </th>
              </tr>
              <tr>
                {report.columns.map((column) => (
                  <th
                    key={column.sessionId}
                    scope="col"
                    className={`border p-1 font-normal ${column.status === "cancelled" ? "line-through" : ""}`}
                  >
                    {column.periodNumber}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.students.map((student, index) => (
                <tr key={student.studentId}>
                  <td className="border p-1 text-center">{index + 1}</td>
                  <td className="border p-1 whitespace-nowrap">{student.fullName}</td>
                  {report.columns.map((column) => (
                    <td key={column.sessionId} className="border p-1 text-center">
                      {symbolFor(report.cells[`${student.studentId}|${column.sessionId}`])}
                    </td>
                  ))}
                  <td className="border p-1 text-center font-bold">
                    {absencesOf(report, student.studentId) || ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-2 text-[9px]">
            ح = {ar.attendanceStatus.present} · غ = {ar.attendanceStatus.absent} · أ ={" "}
            {ar.attendanceStatus.late} · ع = {ar.attendanceStatus.excused}
          </p>
        </>
      )}
    </PrintSheet>
  );
}

function absencesOf(report: ClassMatrixReport, studentId: string): number {
  return report.columns.filter((column) => report.cells[`${studentId}|${column.sessionId}`] === "absent")
    .length;
}

/**
 * One Arabic letter per cell, and a BLANK for a lesson with no mark.
 *
 * The screen shows an em dash there; on paper a blank is better, because a printed
 * register with empty cells is one a teacher can finish by hand — which is how the
 * centre has always used it.
 */
function symbolFor(status: "present" | "absent" | "late" | "excused" | undefined): string {
  switch (status) {
    case "present":
      return "ح";
    case "absent":
      return "غ";
    case "late":
      return "أ";
    case "excused":
      return "ع";
    default:
      return "";
  }
}
