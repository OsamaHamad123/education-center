import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { AbsenceAlertsReport } from "../application/queries/get-reports";

/**
 * Students above the centre's absence threshold (rule 10.7).
 *
 * The WhatsApp link is click-to-chat and nothing more: it opens a conversation the
 * admin then writes themselves. No message is composed, queued or sent — the plan is
 * explicit that there is no automation here, and a system that messages parents on
 * its own is a system that will one day message the wrong one.
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
                </div>

                <Badge variant="destructive" dir="ltr">
                  {row.absencePercent}%
                </Badge>

                <Button asChild variant="outline" size="sm">
                  {/* noreferrer as well as noopener: wa.me has no business knowing
                      which admin screen the click came from. */}
                  <a href={row.whatsappHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" aria-hidden />
                    {ar.reports.whatsapp}
                  </a>
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
