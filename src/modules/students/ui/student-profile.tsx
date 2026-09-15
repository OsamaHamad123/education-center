import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import type { BranchOption } from "@/modules/branches";
import type { ClassOption } from "@/modules/classes";
import { ar } from "@/shared/i18n/ar";
import { formatPhoneForDisplay, whatsAppLink } from "@/shared/lib/phone";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import type { StudentProfile } from "../application/queries/get-student";
import {
  ArchiveStudentDialog,
  ChangeClassDialog,
  RestoreStudentDialog,
  TransferBranchDialog,
} from "./student-actions";

/**
 * The student's page: who they are, where they have been, and what can be done next.
 * A server component — the interactive bits are the dialogs it renders.
 */
export function StudentProfileView({
  profile,
  classes,
  branches,
  classesByBranch,
  canTransferBranch,
  canWrite,
}: {
  profile: StudentProfile;
  classes: ClassOption[];
  branches: BranchOption[];
  classesByBranch: Record<string, ClassOption[]>;
  canTransferBranch: boolean;
  canWrite: boolean;
}) {
  const { student, history, transferredOut } = profile;
  const isArchived = student.status === "archived";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{student.fullName}</h1>
            <span className="text-muted-foreground font-mono text-sm" dir="ltr">
              {student.studentCode}
            </span>
            {isArchived ? <Badge variant="outline">{ar.students.archiveTitle}</Badge> : null}
            {transferredOut ? <Badge variant="outline">{ar.students.transferredOutBadge}</Badge> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" asChild>
            <Link href="/students">
              <ArrowRight className="size-4" aria-hidden />
              {ar.common.back}
            </Link>
          </Button>

          {/* A branch that no longer holds this student may look, not touch. */}
          {canWrite && !transferredOut ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/students/${student.id}/edit`}>
                  <Pencil className="size-4" aria-hidden />
                  {ar.common.edit}
                </Link>
              </Button>

              {isArchived ? (
                <RestoreStudentDialog studentId={student.id} classes={classes} />
              ) : (
                <>
                  <ChangeClassDialog
                    studentId={student.id}
                    classes={classes}
                    currentClassId={student.classId}
                  />
                  {canTransferBranch ? (
                    <TransferBranchDialog
                      studentId={student.id}
                      branches={branches}
                      classesByBranch={classesByBranch}
                      currentBranchId={student.branchId}
                    />
                  ) : null}
                  <ArchiveStudentDialog studentId={student.id} />
                </>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{ar.students.profile}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label={ar.students.joinDate} value={formatDisplayDate(student.joinDate)} />
              <Detail
                label={ar.students.parentPhone}
                value={formatPhoneForDisplay(student.parentPhone)}
                href={whatsAppLink(student.parentWhatsapp ?? student.parentPhone)}
                ltr
              />
              {student.studentPhone ? (
                <Detail
                  label={ar.students.studentPhone}
                  value={formatPhoneForDisplay(student.studentPhone)}
                  ltr
                />
              ) : null}
              {student.nationalId ? (
                <Detail label={ar.students.nationalId} value={student.nationalId} ltr />
              ) : null}
              {isArchived ? (
                <>
                  <Detail
                    label={ar.students.leftDate}
                    value={student.leftDate ? formatDisplayDate(student.leftDate) : "—"}
                  />
                  <Detail label={ar.students.leaveReason} value={student.leaveReason ?? "—"} />
                </>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{ar.students.attendanceSummary}</CardTitle>
            <CardDescription>{ar.students.attendanceSoon}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{ar.students.enrollmentHistory}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-s-2 ps-3">
                <span className="font-medium">
                  {row.branchName} · {row.className}
                </span>
                <span className="text-muted-foreground text-sm" dir="ltr">
                  {formatDisplayDate(row.startDate)} → {row.endDate ? formatDisplayDate(row.endDate) : "…"}
                </span>
                {row.endReason ? (
                  <Badge variant="outline">{ar.enrollmentReasons[row.endReason]}</Badge>
                ) : (
                  <Badge variant="secondary">{ar.common.active}</Badge>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value, href, ltr }: { label: string; value: string; href?: string; ltr?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={ltr ? "font-mono" : undefined} dir={ltr ? "ltr" : undefined}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
