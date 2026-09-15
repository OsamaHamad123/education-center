import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { formatPhoneForDisplay, whatsAppLink } from "@/shared/lib/phone";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import type { TeacherProfile } from "../application/queries/get-teacher";
import { BranchLinkToggle } from "./branch-link-toggle";

/**
 * The teacher's page. A branch admin sees who they are, where they teach and what
 * they have been teaching — but never a rate, which is why `rateHistory` arrives
 * empty for them rather than being hidden in the markup.
 */
export function TeacherProfileView({
  profile,
  canSeeRates,
  canLink,
  viewerBranchId,
}: {
  profile: TeacherProfile;
  canSeeRates: boolean;
  canLink: boolean;
  viewerBranchId: string | null;
}) {
  const { teacher, branches, rateHistory, load, sessions } = profile;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{teacher.fullName}</h1>
          <a
            href={whatsAppLink(teacher.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground font-mono text-sm hover:underline"
            dir="ltr"
          >
            {formatPhoneForDisplay(teacher.phone)}
          </a>
          <Badge variant={teacher.status === "active" ? "secondary" : "outline"}>
            {teacher.status === "active" ? ar.common.active : ar.common.inactive}
          </Badge>
        </div>

        <Button variant="ghost" asChild>
          <Link href="/teachers">
            <ArrowRight className="size-4" aria-hidden />
            {ar.common.back}
          </Link>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ar.teachers.branches}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {branches.map((link) => (
              <div key={link.branchId} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span>{link.branchName}</span>
                  {!link.isActive ? (
                    <Badge variant="outline">{ar.common.inactive}</Badge>
                  ) : link.branchId === viewerBranchId ? (
                    <Badge variant="secondary">{ar.teachers.linkedHere}</Badge>
                  ) : null}
                </div>
                {canLink && (viewerBranchId === null || link.branchId === viewerBranchId) ? (
                  <BranchLinkToggle
                    teacherId={teacher.id}
                    branchId={link.branchId}
                    isActive={link.isActive}
                  />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar.teachers.weeklyLoad}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {load.length === 0 ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              load.map((row) => (
                <p key={row.branchName ?? "?"} className="text-sm">
                  {row.branchName}: {row.slots} {ar.teachers.slots}
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {canSeeRates ? (
        <Card>
          <CardHeader>
            <CardTitle>{ar.teachers.rateHistory}</CardTitle>
            <CardDescription>{ar.teachers.rateHistoryHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {rateHistory.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 border-s-2 ps-3">
                  <span className="text-muted-foreground text-sm">
                    {formatDisplayDate(row.effectiveFrom)}
                  </span>
                  <span dir="ltr">
                    {ar.tracks.scientific}: {formatEGP(row.ratePiastersScientific)}
                  </span>
                  <span dir="ltr">
                    {ar.tracks.literary}: {formatEGP(row.ratePiastersLiterary)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{ar.teachers.recentSessions}</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <EmptyState title={ar.teachers.noSessions} />
          ) : (
            <ul className="space-y-1">
              {sessions.map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="text-muted-foreground" dir="ltr">
                    {formatDisplayDate(row.sessionDate)}
                  </span>
                  <span>{row.subjectName}</span>
                  <span className="text-muted-foreground">{row.branchName}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
