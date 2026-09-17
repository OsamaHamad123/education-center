import Link from "next/link";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { AbsenceAlertsReport } from "../application/queries/get-reports";
import { ContactButton } from "./contact-button";
import { StopMessagesButton } from "./stop-messages-button";

/**
 * Students above the centre's absence threshold (rule 10.7).
 *
 * The WhatsApp link is click-to-chat, now PRE-FILLED from the centre's own template
 * (P4a). Still nothing is queued or sent by a machine: a person reads the message and
 * presses send. A system that messages parents on its own is a system that will one day
 * message the wrong one — see docs/MESSAGING-AND-FEES-PLAN.md for when that changes.
 *
 * "آخر تواصل" comes from the audit log, and is the reason the log is written: it is
 * what stops the same family being rung twice in a morning.
 *
 * The parent's number is masked on screen; only the link carries it (CLAUDE.md).
 */
export function AbsenceAlertsList({ report }: { report: AbsenceAlertsReport }) {
  if (report.rows.length === 0) {
    return <EmptyState title={ar.reports.noAlerts} description={ar.reports.noAlertsHint} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {ar.reports.threshold}: {report.thresholdPercent}% · {ar.reports.minSessions}: {report.minSessions}
      </p>

      <ul className="space-y-2">
        {report.rows.map((row) => (
          <li key={row.studentId}>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 pt-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/students/${row.studentId}`} className="font-medium hover:underline">
                    {row.fullName}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {row.className} · {ar.attendanceStatus.absent} {row.absent} {ar.common.from}{" "}
                    {row.recorded}
                  </p>
                  <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                    {row.maskedPhone}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {row.lastContactedAt
                      ? `${ar.contact.lastContacted} ${formatDisplayDate(row.lastContactedAt.slice(0, 10))}`
                      : ar.contact.neverContacted}
                  </p>
                </div>

                <Badge variant="destructive" dir="ltr">
                  {row.absencePercent}%
                </Badge>

                {row.stopped ? (
                  <Badge variant="outline">{ar.contact.stopped}</Badge>
                ) : (
                  <ContactButton href={row.whatsappHref} studentIds={[row.studentId]} />
                )}
                <StopMessagesButton studentId={row.studentId} stopped={row.stopped} />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
