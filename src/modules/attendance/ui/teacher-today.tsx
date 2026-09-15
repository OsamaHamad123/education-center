import Link from "next/link";
import { ar, weekdayNameOf } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { TeacherToday } from "../application/queries/get-my-today";

/**
 * The teacher's own day (rule 10.9). A server component — it renders data and links,
 * so there is nothing to ship to the browser.
 *
 * When the centre has turned teacher marking off, the periods still show (a teacher
 * should know what they are teaching) but nothing is a link, because tapping into a
 * register they cannot save would be a dead end.
 */
export function TeacherTodayView({ today }: { today: TeacherToday }) {
  const canMark = today.blockedBy === null;

  if (today.periods.length === 0) {
    return (
      <EmptyState
        title={ar.attendance.noSessionsToday}
        description={`${weekdayNameOf(today.date)} · ${formatDisplayDate(today.date)}`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {weekdayNameOf(today.date)} · {formatDisplayDate(today.date)}
      </p>

      {today.blockedBy ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {ar.attendance.violations[today.blockedBy]}
        </p>
      ) : null}

      <ul className="space-y-2">
        {today.periods.map((period) => (
          <li key={period.slotId}>
            <Card>
              <CardContent className="p-0">
                <Wrapper canMark={canMark && !period.cancelled} slotId={period.slotId}>
                  <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-bold">
                    {period.periodNumber}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{period.subjectName}</span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {period.className}
                      {period.branchName ? ` · ${period.branchName}` : ""} ·{" "}
                      <span dir="ltr">
                        {period.startTime} – {period.endTime}
                      </span>
                    </span>
                  </span>

                  <span className="shrink-0">
                    {period.cancelled ? (
                      <Badge variant="destructive">{ar.attendance.cancelledBadge}</Badge>
                    ) : period.markedCount > 0 ? (
                      <Badge variant="secondary">{ar.attendance.marked}</Badge>
                    ) : (
                      <Badge variant="outline">{ar.attendance.unmarked}</Badge>
                    )}
                  </span>
                </Wrapper>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Wrapper({
  canMark,
  slotId,
  children,
}: {
  canMark: boolean;
  slotId: string;
  children: React.ReactNode;
}) {
  if (!canMark) return <div className="flex items-center gap-3 p-3">{children}</div>;

  return (
    <Link
      href={`/teacher/attendance/${slotId}`}
      className="hover:bg-accent/40 flex items-center gap-3 p-3 transition-colors"
      aria-label={ar.attendance.markNow}
    >
      {children}
    </Link>
  );
}
