"use client";

import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent } from "@/shared/ui/card";
import { DataTable } from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import type { StudentReportRow } from "../application/queries/get-reports";

/**
 * Per-student attendance over a range (rule 10.7).
 *
 * The percentage column is the point of the screen, so it is coloured: a number that
 * has to be compared against a threshold in the reader's head is a number that gets
 * read wrong when there are ninety of them.
 */
export function StudentAttendanceTable({ rows }: { rows: StudentReportRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title={ar.reports.empty} description={ar.reports.emptyHint} />;
  }

  const columns: AppColumnDef<StudentReportRow>[] = [
    { accessorKey: "fullName", header: ar.reports.student },
    {
      accessorKey: "studentCode",
      header: ar.students.code,
      cell: ({ row }) => (
        <span className="font-mono text-xs" dir="ltr">
          {row.original.studentCode}
        </span>
      ),
    },
    { accessorKey: "className", header: ar.reports.classLabel },
    { accessorKey: "recorded", header: ar.reports.recorded },
    {
      id: "present",
      header: ar.attendanceStatus.present,
      cell: ({ row }) => row.original.counts.present,
    },
    {
      id: "absent",
      header: ar.attendanceStatus.absent,
      cell: ({ row }) => row.original.counts.absent,
    },
    { id: "late", header: ar.attendanceStatus.late, cell: ({ row }) => row.original.counts.late },
    {
      id: "excused",
      header: ar.attendanceStatus.excused,
      cell: ({ row }) => row.original.counts.excused,
    },
    {
      accessorKey: "attendancePercent",
      header: ar.reports.attendanceRate,
      cell: ({ row }) => <RateBadge percent={row.original.attendancePercent} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(row) => row.studentId}
      searchColumn="fullName"
      searchPlaceholder={ar.reports.student}
      emptyTitle={ar.reports.empty}
      emptyDescription={ar.reports.emptyHint}
      renderCard={(row) => (
        <Card>
          <CardContent className="flex items-start justify-between gap-3 pt-4">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{row.fullName}</p>
              <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                {row.studentCode}
              </p>
              <p className="text-muted-foreground text-sm">
                {row.className} · {ar.reports.recorded} {row.recorded} · {ar.attendanceStatus.absent}{" "}
                {row.counts.absent}
              </p>
            </div>
            <RateBadge percent={row.attendancePercent} />
          </CardContent>
        </Card>
      )}
    />
  );
}

/** Green above 90, amber above 75, red below — read at a glance, not compared. */
function RateBadge({ percent }: { percent: number }) {
  const variant = percent >= 90 ? "secondary" : percent >= 75 ? "outline" : "destructive";
  return (
    <Badge variant={variant} dir="ltr">
      {percent}%
    </Badge>
  );
}
