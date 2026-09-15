import { ar, weekdayName } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { TeacherTimetable } from "../application/queries/get-teacher-timetable";

/**
 * A teacher's week, grouped by day. A server component: it renders data and has no
 * interactions, so there is no reason to ship it to the browser.
 *
 * Which branches appear was decided by RLS in the query — a branch admin looking at a
 * teacher who works in three branches sees their own branch's periods and no gaps
 * suggesting the others.
 */
export function TeacherTimetableView({
  timetable,
  showBranch,
}: {
  timetable: TeacherTimetable;
  /** Off for a branch admin, for whom every row is the same branch anyway. */
  showBranch: boolean;
}) {
  if (timetable.slotCount === 0) {
    return <EmptyState title={ar.timetable.noSlots} description={ar.timetable.emptyHint} />;
  }

  return (
    <div className="space-y-3">
      {timetable.days.map((day) => (
        <Card key={day}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {weekdayName(day)}
              <Badge variant="secondary" className="ms-2">
                {timetable.byDay[day]?.length ?? 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {(timetable.byDay[day] ?? []).map((slot) => (
                <li key={slot.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="text-muted-foreground w-28 shrink-0 font-mono text-xs" dir="ltr">
                    {slot.startTime} – {slot.endTime}
                  </span>
                  <span className="font-medium">{slot.subjectName}</span>
                  <span className="text-muted-foreground">{slot.className}</span>
                  {showBranch ? (
                    <Badge variant="outline" className="ms-auto">
                      {slot.branchName}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
