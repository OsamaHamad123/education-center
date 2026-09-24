import Link from "next/link";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { describePeriodRuns, type StudentAbsences } from "../domain/absences";

/**
 * Today's unexcused absences, on a dashboard (asked for 2026-09-24).
 *
 * Deliberately compact and deliberately not the report. A dashboard card answers "is
 * there anything to deal with right now" — names, the periods, and a way through to
 * the range. Anything more and the card becomes a screen somebody scrolls past.
 *
 * The branch admin and the teacher see the same component. They see different ROWS,
 * because `attendance_records_select` admits a teacher only to their own lessons, and
 * that is the whole of the difference between the two dashboards.
 */
export function TodayAbsencesCard({
  students,
  linkStudents,
  href = "/attendance/absences",
}: {
  students: readonly StudentAbsences[];
  linkStudents: boolean;
  href?: string;
}) {
  const periods = students.reduce((total, student) => total + student.count, 0);

  return (
    <Card className={students.length > 0 ? "border-red-300" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">{ar.absences.today}</CardTitle>
        <CardDescription>
          {students.length === 0
            ? ar.absences.todayNone
            : `${students.length} ${ar.absences.students} · ${periods} ${ar.absences.periods}`}
        </CardDescription>
      </CardHeader>

      {students.length > 0 ? (
        <CardContent className="space-y-2">
          <ul className="divide-y text-sm">
            {students.map((student) => (
              <li key={student.studentId} className="flex flex-wrap items-baseline gap-x-2 py-2">
                {linkStudents ? (
                  <Link href={`/students/${student.studentId}`} className="font-medium hover:underline">
                    {student.fullName}
                  </Link>
                ) : (
                  <span className="font-medium">{student.fullName}</span>
                )}
                <span className="text-muted-foreground text-xs">{student.className}</span>
                <Badge variant="destructive" className="ms-auto">
                  {ar.absences.period} {describePeriodRuns(student.entries.map((e) => e.periodNumber))}
                </Badge>
              </li>
            ))}
          </ul>

          <Link href={href} className="text-primary inline-block text-sm hover:underline">
            {ar.absences.viewAll}
          </Link>
        </CardContent>
      ) : null}
    </Card>
  );
}
