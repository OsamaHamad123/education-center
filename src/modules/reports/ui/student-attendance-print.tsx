import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { StudentAttendanceReport } from "../application/queries/get-reports";

/** The student attendance report on A4 portrait (PROJECT_PLAN section 12). */
export function StudentAttendancePrint({
  report,
  centerName,
  logoPath,
  branchName,
  className,
}: {
  report: StudentAttendanceReport;
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
  className: string | null;
}) {
  return (
    <PrintSheet
      orientation="portrait"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={ar.print.studentAttendance}
      subtitle={`${className ? `${className} — ` : ""}${formatDisplayDate(report.range.from)} — ${formatDisplayDate(report.range.to)}`}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-10 border p-2">
              #
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.reports.student}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.reports.classLabel}
            </th>
            <th scope="col" className="border p-2">
              {ar.reports.recorded}
            </th>
            <th scope="col" className="border p-2">
              {ar.attendanceStatus.absent}
            </th>
            <th scope="col" className="border p-2">
              {ar.attendanceStatus.late}
            </th>
            <th scope="col" className="border p-2">
              {ar.reports.attendanceRate}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={row.studentId} className="break-inside-avoid">
              <td className="border p-2 text-center">{index + 1}</td>
              <td className="border p-2">{row.fullName}</td>
              <td className="border p-2">{row.className}</td>
              <td className="border p-2 text-center">{row.recorded}</td>
              <td className="border p-2 text-center">{row.counts.absent}</td>
              <td className="border p-2 text-center">{row.counts.late}</td>
              <td className="border p-2 text-center" dir="ltr">
                {row.attendancePercent}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  );
}
