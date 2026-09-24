import Link from "next/link";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/date-display";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { describePeriodRuns, type StudentAbsences } from "../domain/absences";

/**
 * Who was absent without permission, and from which lesson (asked for 2026-09-24).
 *
 * A server component: a list of names and numbers with nothing to press but a link to
 * the student. It is shared by the report page, the branch dashboard and the teacher's
 * own day, so the three cannot disagree about what "unexcused" looks like.
 *
 * The student's name is a LINK for an admin and plain text for a teacher, because a
 * teacher has no `student.read` and the profile would 404 on them. Passing that in
 * rather than reading the role here keeps this component a pure render.
 */
export function AbsencesList({
  students,
  linkStudents,
  showDates = true,
}: {
  students: readonly StudentAbsences[];
  linkStudents: boolean;
  /** Off for a one-day list, where every date would be today's. */
  showDates?: boolean;
}) {
  if (students.length === 0) {
    return <EmptyState title={ar.absences.none} description={ar.absences.noneHint} />;
  }

  return (
    <ul className="space-y-2">
      {students.map((student) => (
        <li key={student.studentId}>
          <Card>
            <CardContent className="space-y-2 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  {linkStudents ? (
                    <Link href={`/students/${student.studentId}`} className="font-medium hover:underline">
                      {student.fullName}
                    </Link>
                  ) : (
                    <p className="font-medium">{student.fullName}</p>
                  )}
                  <p className="text-muted-foreground text-sm">{student.className}</p>
                </div>

                {/* The count first: it is what decides whose parent gets rung. */}
                <Badge variant="destructive">
                  {student.count} {ar.absences.periods}
                </Badge>
              </div>

              <ul className="divide-y text-sm">
                {groupByDate(student).map((day) => (
                  <li key={day.sessionDate} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                    {showDates ? (
                      <span className="font-medium">{formatDisplayDate(day.sessionDate)}</span>
                    ) : null}
                    <span className="text-muted-foreground">
                      {ar.absences.period} {describePeriodRuns(day.periods)}
                    </span>
                    <span className="text-muted-foreground text-xs">{day.subjects.join("، ")}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/**
 * One line per DAY under the name, not one per lesson.
 *
 * Three consecutive periods on one Tuesday is one sentence — "the periods 2–4" — and
 * three separate lines would read as three separate incidents.
 */
function groupByDate(
  student: StudentAbsences,
): { sessionDate: string; periods: number[]; subjects: string[] }[] {
  const byDate = new Map<string, { sessionDate: string; periods: number[]; subjects: string[] }>();

  for (const entry of student.entries) {
    const day = byDate.get(entry.sessionDate) ?? {
      sessionDate: entry.sessionDate,
      periods: [],
      subjects: [],
    };
    day.periods.push(entry.periodNumber);
    if (!day.subjects.includes(entry.subjectName)) day.subjects.push(entry.subjectName);
    byDate.set(entry.sessionDate, day);
  }

  return [...byDate.values()];
}
