"use client";

import { Phone, Printer } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { DateField } from "@/shared/ui/date-field";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import type { PortalView } from "../application/queries/get-portal";

/**
 * One child's record, for their parent (docs/PARENT-PORTAL-PLAN.md, P2 and P3).
 *
 * Names are NOT masked here, unlike the anonymous lookup. Masking exists because the
 * lookup answers to anyone holding a code; this answers to a session, and a parent who
 * has proved the phone has earned their own child's name.
 *
 * The branch's phone is on the screen because the next thing a parent does after reading
 * a number they do not like is ring somebody, and making them go and find it is how a
 * portal turns into a complaint.
 */
export function PortalView({ view }: { view: PortalView }) {
  const params = useSearchParams();
  const [isNavigating, navigate] = useNavPending();
  const { attendance, counts } = { attendance: view.attendance, counts: view.attendance.counts };
  const recorded = counts.present + counts.absent + counts.late + counts.excused;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    navigate(`?${next.toString()}`);
  }

  return (
    <div className="space-y-4">
      {view.children.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="portal-child">{ar.portal.chooseChild}</Label>
          <Select
            value={view.selected.studentId}
            onValueChange={(value) => setParam("studentId", value)}
            disabled={isNavigating}
          >
            <SelectTrigger id="portal-child" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view.children.map((child) => (
                <SelectItem key={child.studentId} value={child.studentId}>
                  {child.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{attendance.fullName}</CardTitle>
          <CardDescription>
            {attendance.className} · {attendance.branchName} ·{" "}
            <span className="font-mono" dir="ltr">
              {attendance.studentCode}
            </span>
          </CardDescription>
        </CardHeader>
      </Card>

      <fieldset
        disabled={isNavigating}
        aria-busy={isNavigating}
        className="grid gap-3 transition-opacity disabled:opacity-60 sm:grid-cols-2"
      >
        <div className="space-y-1.5">
          <Label htmlFor="portal-from">{ar.common.from}</Label>
          <DateField id="portal-from" value={view.range.from} onChange={(iso) => setParam("from", iso)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="portal-to">{ar.common.to}</Label>
          <DateField id="portal-to" value={view.range.to} onChange={(iso) => setParam("to", iso)} />
        </div>
      </fieldset>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.portal.attendanceTitle}</CardTitle>
          <CardDescription>
            {formatDisplayDate(view.range.from)} — {formatDisplayDate(view.range.to)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-3xl font-bold" dir="ltr">
            {recorded === 0 ? "—" : `${Math.round((counts.present / Math.max(recorded, 1)) * 100)}%`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {ar.attendanceStatus.present} {counts.present}
            </Badge>
            {counts.absent > 0 ? (
              <Badge variant="destructive">
                {ar.attendanceStatus.absent} {counts.absent}
              </Badge>
            ) : null}
            {counts.late > 0 ? (
              <Badge variant="outline">
                {ar.attendanceStatus.late} {counts.late}
              </Badge>
            ) : null}
            {counts.excused > 0 ? (
              <Badge variant="outline">
                {ar.attendanceStatus.excused} {counts.excused}
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.portal.absencesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {attendance.absences.length === 0 ? (
            <p className="text-muted-foreground text-sm">{ar.portal.noAbsences}</p>
          ) : (
            <ul className="divide-y text-sm">
              {attendance.absences.map((absence, index) => (
                <li key={`${absence.date}-${absence.subjectName}-${index}`} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{absence.subjectName}</span>
                    <Badge variant={absence.status === "absent" ? "destructive" : "outline"}>
                      {ar.attendanceStatus[absence.status]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">{formatDisplayDate(absence.date)}</p>
                  {absence.notes ? <p className="mt-1 text-xs">{absence.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{ar.portal.contactTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {attendance.branchPhone ? (
            <Button asChild variant="outline" className="w-full justify-start">
              <a href={`tel:${attendance.branchPhone}`} dir="ltr">
                <Phone className="size-4" aria-hidden />
                {attendance.branchPhone}
              </a>
            </Button>
          ) : null}
          {attendance.branchAddress ? (
            <p className="text-muted-foreground">{attendance.branchAddress}</p>
          ) : null}
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="w-full">
        <Link
          href={`/portal/print?studentId=${view.selected.studentId}&from=${view.range.from}&to=${view.range.to}`}
          target="_blank"
        >
          <Printer className="size-4" aria-hidden />
          {ar.portal.print}
        </Link>
      </Button>
    </div>
  );
}
