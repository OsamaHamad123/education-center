import { ar } from "@/shared/i18n/ar";
import { EmptyState } from "@/shared/ui/empty-state";
import type { ClassMatrixReport } from "../application/queries/get-reports";

/**
 * The register sheet: students × LESSONS for one class (rule 10.7). A server component
 * — it is a table of letters, and there is nothing here to interact with.
 *
 * It used to be students × days, one cell per day holding the worst status in it. The
 * centre sent photographs of the paper register it actually keeps, and every date on it
 * carries a sub-column per period, because a boy who sits through first period and
 * walks out of second is two facts and the fold made it one (2026-09-24).
 *
 * So the header is two rows: the date on top, spanning however many lessons ran that
 * day, and the period number under it. Which is what the paper does.
 */
export function ClassMatrix({ report }: { report: ClassMatrixReport }) {
  if (report.columns.length === 0) {
    return <EmptyState title={ar.reports.noSessions} description={ar.reports.emptyHint} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className="bg-background sticky start-0 border p-2 text-start">
              {ar.reports.student}
            </th>
            {report.days.map((day) => (
              <th
                key={day.sessionDate}
                scope="col"
                colSpan={day.periods}
                className="border p-1 text-xs whitespace-nowrap"
              >
                {/* dd/MM only: the year is the same for every column in one range. */}
                {day.sessionDate.slice(8, 10)}/{day.sessionDate.slice(5, 7)}
              </th>
            ))}
            {/*
              A total, so the eye does not have to count pink cells
              (docs/PRODUCT-REVIEW-2026-09.md). It is what turns this picture into a
              decision about who to ring. It spans both header rows.
            */}
            <th
              scope="col"
              rowSpan={2}
              className="bg-background sticky end-0 border p-2 text-xs whitespace-nowrap"
            >
              {ar.attendanceStatus.absent}
            </th>
          </tr>
          <tr>
            {report.columns.map((column) => (
              <th
                key={column.sessionId}
                scope="col"
                className={`text-muted-foreground border p-1 text-[0.625rem] font-normal ${
                  column.status === "cancelled" ? "line-through" : ""
                }`}
                title={`${column.subjectName}${column.status === "cancelled" ? ` — ${ar.attendance.cancelled}` : ""}`}
              >
                {column.periodNumber}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.students.map((student) => (
            <tr key={student.studentId}>
              <th
                scope="row"
                className="bg-background sticky start-0 border p-2 text-start font-normal whitespace-nowrap"
              >
                {student.fullName}
              </th>
              {report.columns.map((column) => {
                const status = report.cells[`${student.studentId}|${column.sessionId}`];
                return (
                  <td
                    key={column.sessionId}
                    className={`border p-1 text-center text-xs ${cellClass(status)}`}
                    title={status ? ar.attendanceStatus[status] : undefined}
                  >
                    {symbolFor(status)}
                  </td>
                );
              })}
              <td className="bg-background sticky end-0 border p-2 text-center text-xs font-medium">
                {absencesOf(report, student.studentId) || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Legend />
    </div>
  );
}

/**
 * How many LESSONS in this range the student missed — counted from the cells shown.
 *
 * Periods, not days, now that the grid holds periods. A boy who skipped two lessons on
 * one day has missed two lessons, and the teacher who taught the second one is owed
 * that fact.
 */
function absencesOf(report: ClassMatrixReport, studentId: string): number {
  return report.columns.filter((column) => report.cells[`${studentId}|${column.sessionId}`] === "absent")
    .length;
}

/**
 * A single Arabic letter per cell. Colour alone would fail anyone who cannot see it,
 * and a full word per cell would not fit thirty columns on any screen.
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
      return "—";
  }
}

function cellClass(status: "present" | "absent" | "late" | "excused" | undefined): string {
  switch (status) {
    case "present":
      return "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100";
    case "absent":
      return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
    case "late":
      return "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
    case "excused":
      return "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100";
    default:
      return "text-muted-foreground";
  }
}

function Legend() {
  return (
    <p className="text-muted-foreground mt-2 text-xs">
      ح = {ar.attendanceStatus.present} · غ = {ar.attendanceStatus.absent} · أ = {ar.attendanceStatus.late} ·
      ع = {ar.attendanceStatus.excused}
    </p>
  );
}
