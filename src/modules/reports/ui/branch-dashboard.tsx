import Link from "next/link";
import { ar, weekdayNameOf } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import type { BranchDashboard } from "../application/queries/get-reports";

/**
 * Today, for a branch admin (rule 10.7). Four numbers and a short list — the point of
 * this screen is the GAP between the periods planned and the registers taken, which
 * is the thing somebody has to chase before the day ends.
 */
export function BranchDashboardView({ dashboard }: { dashboard: BranchDashboard }) {
  const remaining = Math.max(dashboard.pulse.sessionsPlanned - dashboard.pulse.sessionsDone, 0);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {weekdayNameOf(dashboard.date)} · {formatDisplayDate(dashboard.date)}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={ar.reports.sessionsPlanned} value={dashboard.pulse.sessionsPlanned} />
        <Kpi label={ar.reports.sessionsDone} value={dashboard.pulse.sessionsDone} />
        <Kpi
          label={ar.reports.sessionsRemaining}
          value={remaining}
          href="/attendance"
          emphasis={remaining > 0}
        />
        <Kpi
          label={ar.reports.todayAttendance}
          value={`${dashboard.attendancePercent}%`}
          muted={dashboard.pulse.counts.present + dashboard.pulse.counts.absent === 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.reports.topAbsent}</CardTitle>
          <CardDescription>{ar.reports.absenceAlertsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.topAbsent.length === 0 ? (
            <p className="text-muted-foreground text-sm">{ar.reports.noAbsences}</p>
          ) : (
            <ul className="divide-y text-sm">
              {dashboard.topAbsent.map((student) => (
                <li key={student.fullName} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{student.fullName}</span>
                    <span className="text-muted-foreground block truncate text-xs">{student.className}</span>
                  </span>
                  <Badge variant="destructive">
                    {ar.attendanceStatus.absent} {student.absent}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
  emphasis,
  muted,
}: {
  label: string;
  value: number | string;
  href?: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  const body = (
    <CardContent className="pt-6">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p
        className={`text-3xl font-bold ${emphasis ? "text-amber-600" : ""} ${muted ? "text-muted-foreground" : ""}`}
        dir="ltr"
      >
        {value}
      </p>
    </CardContent>
  );

  if (!href) return <Card>{body}</Card>;

  return (
    <Card className="hover:bg-accent/40 transition-colors">
      <Link href={href} aria-label={label}>
        {body}
      </Link>
    </Card>
  );
}
