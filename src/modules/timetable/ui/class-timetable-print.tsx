import { ar, weekdayName } from "@/shared/i18n/ar";
import { PrintSheet } from "@/shared/ui/print-sheet";
import { cellKey } from "../domain/copy-timetable";
import type { ClassTimetable } from "../application/queries/get-class-timetable";
import type { TeacherTimetable } from "../application/queries/get-teacher-timetable";

/** A4 landscape: days down the side, periods across (PROJECT_PLAN section 12). */
export function ClassTimetablePrint({
  timetable,
  centerName,
  logoPath,
  branchName,
}: {
  timetable: ClassTimetable;
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
}) {
  return (
    <PrintSheet
      orientation="landscape"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={ar.print.classTimetable}
      subtitle={timetable.classRef.name}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="border p-2 text-start">
              {ar.timetable.day}
            </th>
            {timetable.periods.map((period) => (
              <th key={period.periodNumber} scope="col" className="border p-2">
                <div>
                  {ar.timetable.period} {period.periodNumber}
                </div>
                <div className="text-xs font-normal" dir="ltr">
                  {period.startTime} – {period.endTime}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timetable.days.map((day) => (
            <tr key={day} className="break-inside-avoid">
              <th scope="row" className="border p-2 text-start whitespace-nowrap">
                {weekdayName(day)}
              </th>
              {timetable.periods.map((period) => {
                const cell = timetable.cells[cellKey(day, period.periodNumber)];
                return (
                  <td key={period.periodNumber} className="border p-2 align-top">
                    {cell ? (
                      <>
                        <span className="block font-medium">{cell.subjectName}</span>
                        <span className="block text-xs">{cell.teacherName}</span>
                      </>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </PrintSheet>
  );
}

/**
 * A teacher's week. It carries a branch column because a teacher genuinely moves
 * between branches during a week — but only the branches the VIEWER may see are in
 * the data at all, because RLS filtered the query, not this component.
 */
export function TeacherTimetablePrint({
  timetable,
  teacherName,
  centerName,
  logoPath,
  branchName,
}: {
  timetable: TeacherTimetable;
  teacherName: string;
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
}) {
  return (
    <PrintSheet
      orientation="landscape"
      centerName={centerName}
      logoPath={logoPath}
      branchName={branchName}
      title={ar.print.teacherTimetable}
      subtitle={teacherName}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="border p-2 text-start">
              {ar.timetable.day}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.timetable.time}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.timetable.subject}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.timetable.classLabel}
            </th>
            <th scope="col" className="border p-2 text-start">
              {ar.timetable.branch}
            </th>
          </tr>
        </thead>
        <tbody>
          {timetable.days.flatMap((day) =>
            (timetable.byDay[day] ?? []).map((slot, index) => (
              <tr key={slot.id} className="break-inside-avoid">
                {index === 0 ? (
                  <th
                    scope="row"
                    rowSpan={timetable.byDay[day]?.length ?? 1}
                    className="border p-2 text-start align-top whitespace-nowrap"
                  >
                    {weekdayName(day)}
                  </th>
                ) : null}
                <td className="border p-2 font-mono text-xs" dir="ltr">
                  {slot.startTime} – {slot.endTime}
                </td>
                <td className="border p-2">{slot.subjectName}</td>
                <td className="border p-2">{slot.className}</td>
                <td className="border p-2">{slot.branchName}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </PrintSheet>
  );
}
