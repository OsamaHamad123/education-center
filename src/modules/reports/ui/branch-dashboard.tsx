import Link from "next/link";
import { ar, weekdayNameOf } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import type { BranchDashboard } from "../application/queries/get-reports";

/**
 * Today, for a branch admin (rule 10.7).
 *
 * It used to be four numbers, and the only one worth acting on — the gap between the
 * periods planned and the registers taken — was a figure in a box
 * (docs/PRODUCT-REVIEW-2026-09.md, finding 3). The work comes first now: which period,
 * which class, which teacher, and a link straight into the register. The numbers stayed;
 * they moved below it and got smaller.
 *
 * The attendance percentage also said "100%" at ten in the morning with a register still
 * open, because it is the percentage of what has been MARKED. It says so now.
 */
export function BranchDashboardView({ dashboard }: { dashboard: BranchDashboard }) {
  const remaining = Math.max(dashboard.pulse.sessionsPlanned - dashboard.pulse.sessionsDone, 0);
  const marked = dashboard.pulse.counts.present + dashboard.pulse.counts.absent;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {weekdayNameOf(dashboard.date)} · {formatDisplayDate(dashboard.date)}
      </p>

      {/* The work, before the scoreboard. */}
      <Card className={dashboard.openRegisters.length > 0 ? "border-amber-300" : undefined}>
        <CardHeader>
          <CardTitle className="text-base">{ar.reports.openRegisters}</CardTitle>
          <CardDescription>{ar.reports.openRegistersDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboard.openRegisters.length === 0 ? (
            <p className="text-sm font-medium text-emerald-700">{ar.reports.allRegistersDone}</p>
          ) : (
            <ul className="divide-y text-sm">
              {dashboard.openRegisters.map((slot) => (
                <li key={slot.slotId}>
                  <Link
                    href={`/attendance/mark?classId=${slot.classId}&date=${dashboard.date}&period=${slot.periodNumber}`}
                    className="hover:bg-accent/40 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
                  >
                    <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-bold">
                      {slot.periodNumber}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {slot.className} — {slot.subjectName}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {slot.teacherName} ·{" "}
                        <span dir="ltr">
                          {slot.startTime} – {slot.endTime}
                        </span>
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">{ar.attendance.markNow}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
          /* "100%" of what has been marked is not "100% attendance today", and at ten in
             the morning the difference is the whole meaning of the number. */
          label={marked > 0 ? ar.reports.attendanceOfMarked : ar.reports.todayAttendance}
          value={`${dashboard.attendancePercent}%`}
          muted={marked === 0}
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
