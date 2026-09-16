import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { formatDisplayDate } from "@/shared/lib/time";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { PayrollReport } from "../application/queries/get-payroll";

/**
 * Payroll on paper (PROJECT_PLAN section 12): portrait, with signature lines, because
 * this sheet is what someone signs when they are handed an envelope.
 */
export function PayrollPrint({
  report,
  centerName,
  logoPath,
  branchName,
}: {
  report: PayrollReport;
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
      title={ar.print.payroll}
      subtitle={`${formatDisplayDate(report.from)} — ${formatDisplayDate(report.to)}`}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="border p-2 text-start">
              {ar.payroll.teacher}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.payroll.branch}
            </th>
            <th scope="col" className="border p-2">
              {ar.payroll.scientificSessions}
            </th>
            <th scope="col" className="border p-2">
              {ar.payroll.literarySessions}
            </th>
            <th scope="col" className="border p-2">
              {ar.payroll.total}
            </th>
            <th scope="col" className="w-40 border p-2">
              {ar.payroll.signature}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.teachers.flatMap((teacher) =>
            teacher.earnings.branches.map((branch, index) => (
              <tr key={`${teacher.teacherId}-${branch.branchId}`} className="break-inside-avoid">
                <td className="border p-2">{index === 0 ? teacher.teacherName : ""}</td>
                <td className="border p-2">{teacher.branchNames[branch.branchId] ?? ""}</td>
                <td className="border p-2 text-center">{branch.scientific.sessions}</td>
                <td className="border p-2 text-center">{branch.literary.sessions}</td>
                <td className="border p-2 text-center" dir="ltr">
                  {formatEGP(branch.amountPiasters)}
                </td>
                {/* Deliberately empty: it is signed in ink when the money changes hands. */}
                <td className="border p-2" />
              </tr>
            )),
          )}
          <tr className="font-bold">
            <td className="border p-2" colSpan={4}>
              {ar.payroll.grandTotal}
            </td>
            <td className="border p-2 text-center" dir="ltr">
              {formatEGP(report.totalPiasters)}
            </td>
            <td className="border p-2" />
          </tr>
        </tbody>
      </table>

      <p className="text-muted-foreground mt-3 text-xs">{ar.payroll.cancelledExcluded}</p>
    </PrintSheet>
  );
}
