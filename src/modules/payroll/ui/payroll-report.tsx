"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { ar } from "@/shared/i18n/ar";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import { ensureBom } from "@/shared/lib/csv";
import { formatEGP } from "@/shared/lib/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { PayrollReport, TeacherEarnings } from "../application/queries/get-payroll";
import { exportPayrollCsv } from "../application/use-cases/export-payroll";
import { DateField } from "@/shared/ui/date-field";

const ANY = "__any__";

/**
 * The payroll report (rule 10.6). Grouped teacher → branch → track, because that is
 * how it is paid: a teacher shared between two branches is owed by each of them, and
 * the two tracks are priced differently.
 *
 * Every amount here was summed in SQL as integer piasters; `formatEGP` is the first
 * and only place a decimal point appears.
 */
export function PayrollReportView({ report }: { report: PayrollReport }) {
  const [isNavigating, navigate] = useNavPending();
  const params = useSearchParams();
  const [isExporting, startExport] = useTransition();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ANY) next.delete(key);
    else next.set(key, value);
    navigate(`?${next.toString()}`);
  }

  function download() {
    startExport(async () => {
      const result = await exportPayrollCsv({
        from: report.from,
        to: report.to,
        teacherId: report.teacherId ?? undefined,
        branchId: report.branchId ?? undefined,
      });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      // A blob, not a route: payroll is a list of what people are paid, and a URL is
      // something that can be forwarded or end up in a log.
      // `ensureBom`, not `result.data`: a server action does not return the leading
      // U+FEFF `toCsv` wrote, so without this every export opened in Excel as
      // mojibake (docs/AUDIT-2026-09.md, finding 13).
      const blob = new Blob([ensureBom(result.data)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payroll-${report.from}-${report.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  const printHref = `/print/payroll?from=${report.from}&to=${report.to}${
    report.teacherId ? `&teacherId=${report.teacherId}` : ""
  }${report.branchId ? `&branchId=${report.branchId}` : ""}`;

  return (
    <div className="space-y-4">
      {/*
        Disabled as a group while the next report is being fetched
        (docs/UX-AUDIT-2026-09.md, finding 3). A fieldset rather than a styling trick:
        `disabled` reaches every control inside it, keyboard included.
      */}
      <fieldset
        disabled={isNavigating}
        aria-busy={isNavigating}
        className="grid gap-3 transition-opacity disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="payroll-from">{ar.payroll.from}</Label>
          <DateField
            id="payroll-from"
            value={report.from}
            onChange={(isoDate) => setParam("from", isoDate)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payroll-to">{ar.payroll.to}</Label>
          <DateField id="payroll-to" value={report.to} onChange={(isoDate) => setParam("to", isoDate)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="payroll-teacher">{ar.payroll.teacher}</Label>
          <Select value={report.teacherId ?? ANY} onValueChange={(value) => setParam("teacherId", value)}>
            <SelectTrigger id="payroll-teacher" className="w-full">
              <SelectValue placeholder={ar.payroll.allTeachers} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{ar.payroll.allTeachers}</SelectItem>
              {report.teacherOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* A branch admin has no branch picker at all — their scope is not a filter. */}
        {report.canChooseBranch ? (
          <div className="space-y-1.5">
            <Label htmlFor="payroll-branch">{ar.payroll.branch}</Label>
            <Select value={report.branchId ?? ANY} onValueChange={(value) => setParam("branchId", value)}>
              <SelectTrigger id="payroll-branch" className="w-full">
                <SelectValue placeholder={ar.payroll.allBranches} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{ar.payroll.allBranches}</SelectItem>
                {report.branchOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {ar.payroll.sessions}: {report.totalSessions}
        </Badge>
        <Badge variant="secondary" dir="ltr">
          {formatEGP(report.totalPiasters)}
        </Badge>
        <span className="text-muted-foreground text-xs">{ar.payroll.cancelledExcluded}</span>

        <div className="ms-auto flex gap-2">
          <Button variant="outline" onClick={download} disabled={isExporting}>
            <Download className="size-4" aria-hidden />
            {ar.common.export}
          </Button>
          <Button asChild variant="outline">
            <Link href={printHref} target="_blank">
              <Printer className="size-4" aria-hidden />
              {ar.common.print}
            </Link>
          </Button>
        </div>
      </div>

      {report.teachers.length === 0 ? (
        <EmptyState title={ar.payroll.empty} description={ar.payroll.emptyHint} />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar.payroll.teacher}</TableHead>
                  <TableHead>{ar.payroll.branch}</TableHead>
                  <TableHead>{ar.payroll.scientificSessions}</TableHead>
                  <TableHead>{ar.payroll.scientificAmount}</TableHead>
                  <TableHead>{ar.payroll.literarySessions}</TableHead>
                  <TableHead>{ar.payroll.literaryAmount}</TableHead>
                  <TableHead>{ar.payroll.total}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.teachers.flatMap((teacher) =>
                  teacher.earnings.branches.map((branch, index) => (
                    <TableRow key={`${teacher.teacherId}-${branch.branchId}`}>
                      <TableCell className="font-medium">{index === 0 ? teacher.teacherName : ""}</TableCell>
                      <TableCell>{teacher.branchNames[branch.branchId] ?? ""}</TableCell>
                      <TableCell>{branch.scientific.sessions}</TableCell>
                      <TableCell dir="ltr">{formatEGP(branch.scientific.amountPiasters)}</TableCell>
                      <TableCell>{branch.literary.sessions}</TableCell>
                      <TableCell dir="ltr">{formatEGP(branch.literary.amountPiasters)}</TableCell>
                      <TableCell className="font-medium" dir="ltr">
                        {formatEGP(branch.amountPiasters)}
                      </TableCell>
                      <TableCell>
                        {index === 0 ? <DrillDownLink report={report} teacher={teacher} /> : null}
                      </TableCell>
                    </TableRow>
                  )),
                )}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={6}>{ar.payroll.grandTotal}</TableCell>
                  <TableCell dir="ltr">{formatEGP(report.totalPiasters)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">
            {report.teachers.map((teacher) => (
              <Card key={teacher.teacherId}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{teacher.teacherName}</p>
                    <span className="font-medium" dir="ltr">
                      {formatEGP(teacher.earnings.amountPiasters)}
                    </span>
                  </div>
                  {teacher.earnings.branches.map((branch) => (
                    <p key={branch.branchId} className="text-muted-foreground text-sm">
                      {teacher.branchNames[branch.branchId] ?? ""} · {ar.tracks.scientific}{" "}
                      {branch.scientific.sessions} · {ar.tracks.literary} {branch.literary.sessions} ·{" "}
                      <span dir="ltr">{formatEGP(branch.amountPiasters)}</span>
                    </p>
                  ))}
                  <DrillDownLink report={report} teacher={teacher} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DrillDownLink({ report, teacher }: { report: PayrollReport; teacher: TeacherEarnings }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link
        href={`/payroll/${teacher.teacherId}?from=${report.from}&to=${report.to}${
          report.branchId ? `&branchId=${report.branchId}` : ""
        }`}
      >
        <ChevronDown className="size-4" aria-hidden />
        {ar.payroll.details}
      </Link>
    </Button>
  );
}

/** The drill-down list: which lessons make up the total (rule 10.6). */
export function PayrollSessionsView({
  teacherName,
  sessions,
  truncated,
}: {
  teacherName: string;
  sessions: {
    id: string;
    sessionDate: string;
    periodNumber: number;
    subjectName: string;
    className: string;
    branchName: string | null;
    track: "scientific" | "literary";
    amountPiasters: number;
    isExtra: boolean;
  }[];
  truncated: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sessions : sessions.slice(0, 50);

  if (sessions.length === 0) {
    return <EmptyState title={ar.payroll.empty} description={ar.payroll.emptyHint} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {ar.payroll.detailsFor} {teacherName} — {sessions.length}
      </p>
      {truncated ? <p className="text-sm text-amber-700">{ar.payroll.truncated}</p> : null}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ar.attendance.date}</TableHead>
              <TableHead>{ar.attendance.period}</TableHead>
              <TableHead>{ar.attendance.subject}</TableHead>
              <TableHead>{ar.attendance.classLabel}</TableHead>
              <TableHead>{ar.payroll.branch}</TableHead>
              <TableHead>{ar.payroll.track}</TableHead>
              <TableHead>{ar.payroll.total}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="whitespace-nowrap">{session.sessionDate}</TableCell>
                <TableCell>
                  {session.periodNumber}
                  {session.isExtra ? (
                    <Badge variant="outline" className="ms-1">
                      {ar.attendance.extraBadge}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{session.subjectName}</TableCell>
                <TableCell>{session.className}</TableCell>
                <TableCell>{session.branchName ?? ""}</TableCell>
                <TableCell>{ar.tracks[session.track]}</TableCell>
                <TableCell dir="ltr">{formatEGP(session.amountPiasters)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!showAll && sessions.length > 50 ? (
        <Button variant="outline" onClick={() => setShowAll(true)}>
          {ar.common.all} ({sessions.length})
        </Button>
      ) : null}
    </div>
  );
}
