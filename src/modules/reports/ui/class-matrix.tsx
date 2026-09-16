import { ar } from "@/shared/i18n/ar";
import { EmptyState } from "@/shared/ui/empty-state";
import type { ClassMatrixReport } from "../application/queries/get-reports";

/**
 * Students × dates for one class (rule 10.7). A server component — it is a table of
 * letters, and there is nothing here to interact with.
 *
 * A day can hold several periods; the cell shows the WORST status of the day, because
 * the question this grid answers is "which days did this student miss".
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
            <th scope="col" className="bg-background sticky start-0 border p-2 text-start">
              {ar.reports.student}
            </th>
            {report.columns.map((column) => (
              <th key={column.sessionDate} scope="col" className="border p-1 text-xs whitespace-nowrap">
                {/* dd/MM only: the year is the same for every column in one range. */}
                {column.sessionDate.slice(8, 10)}/{column.sessionDate.slice(5, 7)}
              </th>
            ))}
            {/*
              A total, so the eye does not have to count pink cells
              (docs/PRODUCT-REVIEW-2026-09.md). It is what turns this picture into a
              decision about who to ring.
            */}
            <th scope="col" className="bg-background sticky end-0 border p-2 text-xs whitespace-nowrap">
              {ar.attendanceStatus.absent}
            </th>
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
                const status = report.cells[`${student.studentId}|${column.sessionDate}`];
                return (
                  <td
                    key={column.sessionDate}
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

/** How many days in this range the student was absent — counted from the cells shown. */
function absencesOf(report: ClassMatrixReport, studentId: string): number {
  return report.columns.filter((column) => report.cells[`${studentId}|${column.sessionDate}`] === "absent")
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
