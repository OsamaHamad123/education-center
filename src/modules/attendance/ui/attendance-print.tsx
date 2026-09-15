import { ar, weekdayNameOf } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { AttendanceSheet } from "../application/queries/get-attendance-board";

/**
 * The daily class attendance sheet (PROJECT_PLAN section 12). Portrait, one row per
 * student, with an empty signature column — the paper version is often signed and
 * filed, so it carries a place for that rather than assuming the screen is enough.
 */
export function AttendanceSheetPrint({
  sheet,
  centerName,
  logoPath,
  branchName,
}: {
  sheet: AttendanceSheet;
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
}) {
  return (
    <PrintSheet
      orientation="portrait"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={ar.print.attendanceSheet}
      subtitle={`${sheet.classRef.name} — ${sheet.subjectName}`}
      signature
    >
      <p className="mb-3 text-sm">
        {weekdayNameOf(sheet.sessionDate)} {formatDisplayDate(sheet.sessionDate)} · {ar.attendance.period}{" "}
        {sheet.periodNumber} ·{" "}
        <span dir="ltr">
          {sheet.startTime} – {sheet.endTime}
        </span>{" "}
        · {sheet.teacherName}
      </p>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-10 border p-2">
              #
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.students.fullName}
            </th>
            <th scope="col" className="w-28 border p-2">
              {ar.students.code}
            </th>
            <th scope="col" className="w-20 border p-2">
              {ar.attendance.status}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.attendance.notes}
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.students.map((student, index) => (
            <tr key={student.studentId} className="break-inside-avoid">
              <td className="border p-2 text-center">{index + 1}</td>
              <td className="border p-2">{student.fullName}</td>
              <td className="border p-2 text-center font-mono text-xs" dir="ltr">
                {student.studentCode}
              </td>
              <td className="border p-2 text-center">{ar.attendanceStatus[student.status]}</td>
              <td className="border p-2">{student.notes ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-sm">
        {ar.attendance.summary}: {ar.attendanceStatus.present} {sheet.summary.present} ·{" "}
        {ar.attendanceStatus.absent} {sheet.summary.absent} · {ar.attendanceStatus.late} {sheet.summary.late}{" "}
        · {ar.attendanceStatus.excused} {sheet.summary.excused} · {ar.attendance.attendedPercent}{" "}
        {sheet.summary.attendedPercent}%
      </p>
    </PrintSheet>
  );
}
