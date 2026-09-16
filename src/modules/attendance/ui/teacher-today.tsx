import Link from "next/link";
import { ar, weekdayNameOf } from "@/shared/i18n/ar";
import { formatDisplayDate, nowTimeInCairo, todayInCairo } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { TeacherToday, TodayPeriod } from "../application/queries/get-my-today";

/**
 * The teacher's own day (rule 10.9). A server component — it renders data and links,
 * so there is nothing to ship to the browser.
 *
 * Rebuilt after the product review. The card used to put the class, the branch and the
 * time on one truncated line, and what fell off the end was **when the lesson finishes**
 * — on the screen a teacher opens six times a day. Three things changed:
 *
 *  - the time is on its own line and never truncates;
 *  - the lesson happening now, or the next one, is marked, so a teacher arriving at
 *    09:20 does not have to read four cards to find theirs;
 *  - an unmarked lesson looks unfinished rather than looking like the others.
 *
 * When the centre has turned teacher marking off, the periods still show (a teacher
 * should know what they are teaching) but nothing is a link, because tapping into a
 * register they cannot save would be a dead end.
 */
export function TeacherTodayView({ today }: { today: TeacherToday }) {
  const canMark = today.blockedBy === null;
  const currentSlotId = focusOf(today);
  const unmarked = today.periods.filter((period) => !period.cancelled && period.markedCount === 0).length;

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {weekdayNameOf(today.date)} · {formatDisplayDate(today.date)}
        </p>
        {/* One line that answers "am I done?" without counting the badges below. */}
        {unmarked > 0 ? (
          <Badge variant="outline" className="border-amber-400 text-amber-700">
            {unmarked} {ar.attendance.stillUnmarked}
          </Badge>
        ) : (
          <Badge variant="secondary">{ar.attendance.allMarkedToday}</Badge>
        )}
      </div>

      {today.blockedBy ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {ar.attendance.violations[today.blockedBy]}
        </p>
      ) : null}

      <ul className="space-y-2">
        {today.periods.map((period) => (
          <li key={period.slotId}>
            <PeriodCard
              period={period}
              canMark={canMark && !period.cancelled}
              isFocus={period.slotId === currentSlotId}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PeriodCard({
  period,
  canMark,
  isFocus,
}: {
  period: TodayPeriod;
  canMark: boolean;
  isFocus: boolean;
}) {
  const needsMarking = !period.cancelled && period.markedCount === 0;

  return (
    <Card
      className={
        isFocus ? "border-primary ring-primary/20 ring-2" : needsMarking ? "border-amber-300" : undefined
      }
    >
      <CardContent className="p-0">
        <Wrapper canMark={canMark} slotId={period.slotId}>
          <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md text-sm font-bold">
            {period.periodNumber}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{period.subjectName}</span>
              {isFocus ? (
                <Badge variant="default" className="shrink-0">
                  {ar.attendance.now}
                </Badge>
              ) : null}
            </span>

            {/* The time gets its own line: it is the fact, and it used to be the part
                that fell off the end of a truncated one. */}
            <span className="block text-sm font-medium" dir="ltr">
              {period.startTime} – {period.endTime}
            </span>

            <span className="text-muted-foreground block truncate text-sm">
              {period.className}
              {period.branchName ? ` · ${period.branchName}` : ""}
            </span>
          </span>

          <span className="shrink-0">
            {period.cancelled ? (
              <Badge variant="destructive">{ar.attendance.cancelledBadge}</Badge>
            ) : period.markedCount > 0 ? (
              <Badge variant="secondary">{ar.attendance.marked}</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-400 text-amber-700">
                {ar.attendance.unmarked}
              </Badge>
            )}
          </span>
        </Wrapper>
      </CardContent>
    </Card>
  );
}

/**
 * The lesson to look at first: the one running now, or else the next one to start.
 *
 * Only for today — on any other day "now" means nothing, and highlighting a period
 * because the clock happens to be past it would be noise.
 */
function focusOf(today: TeacherToday): string | null {
  if (today.date !== todayInCairo()) return null;

  const now = nowTimeInCairo();
  const running = today.periods.find(
    (period) => !period.cancelled && period.startTime <= now && now < period.endTime,
  );
  if (running) return running.slotId;

  const next = today.periods.find((period) => !period.cancelled && period.startTime > now);
  return next?.slotId ?? null;
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
