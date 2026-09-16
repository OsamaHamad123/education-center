import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { ContactList } from "../application/queries/get-contact-list";
import { ContactButton } from "./contact-button";

/**
 * Today's absences, one row per family (P4b).
 *
 * The rule this screen exists to enforce is *one message a day, not one per period* —
 * so a child who missed three periods is one row naming three, and two siblings are one
 * row with one message. Both come from `domain/contact-list.ts`; this only draws it.
 *
 * The message is shown in full under each row on purpose. The office is about to send it
 * to a parent, and a button whose text you cannot read before you press it is a button
 * people stop pressing.
 */
export function ContactListView({ list }: { list: ContactList }) {
  return (
    <div className="space-y-3">
      {list.openRegisters > 0 ? (
        <div
          role="status"
          className="border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {/* A day that is not finished is a day whose absences are not final. Sending
                now is the six-messages mistake wearing a different hat. */}
            {ar.contact.openRegisters(list.openRegisters)}
          </p>
        </div>
      ) : null}

      {list.rows.length === 0 ? (
        <EmptyState title={ar.contact.empty} description={ar.contact.emptyHint} />
      ) : (
        <ul className="space-y-2">
          {list.rows.map((row) => (
            <li key={row.parentPhone}>
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      {row.children.map((child) => (
                        <div key={child.studentId}>
                          <Link href={`/students/${child.studentId}`} className="font-medium hover:underline">
                            {child.fullName}
                          </Link>
                          <p className="text-muted-foreground text-sm">
                            {child.className} ·{" "}
                            {child.periods
                              .map(
                                (period) =>
                                  `${period.subjectName} (${ar.units.period} ${period.periodNumber})`,
                              )
                              .join("، ")}
                          </p>
                        </div>
                      ))}
                      <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                        {row.maskedPhone}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {row.repeated ? <Badge variant="destructive">{ar.contact.repeated}</Badge> : null}
                      {row.children.length > 1 ? (
                        <Badge variant="outline">{ar.contact.siblings(row.children.length)}</Badge>
                      ) : null}
                      <ContactButton
                        href={row.whatsappHref}
                        studentIds={row.children.map((child) => child.studentId)}
                      />
                    </div>
                  </div>

                  <p className="bg-muted rounded-md p-2 text-xs whitespace-pre-wrap">{row.message}</p>

                  <p className="text-muted-foreground text-xs">
                    {row.lastContactedAt
                      ? `${ar.contact.lastContacted} ${formatDisplayDate(row.lastContactedAt.slice(0, 10))}`
                      : ar.contact.neverContacted}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
