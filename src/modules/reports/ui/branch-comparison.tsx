"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ar } from "@/shared/i18n/ar";
import { formatEGP, piastersToPounds } from "@/shared/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { EmptyState } from "@/shared/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { BranchComparison } from "../application/queries/get-reports";

/**
 * The super admin's view across branches (rule 10.7).
 *
 * Charts AND a table, not charts alone: a bar shows which branch is ahead, but the
 * number that gets copied into a message is read off the table. The chart is the
 * summary; the table is the record.
 */
export function BranchComparisonView({ comparison }: { comparison: BranchComparison }) {
  if (comparison.rows.length === 0) {
    return <EmptyState title={ar.reports.empty} description={ar.reports.emptyHint} />;
  }

  const attendance = comparison.rows.map((row) => ({
    name: row.branchName,
    value: row.attendancePercent,
  }));
  // Recharts works in numbers, so payroll is charted in POUNDS; the table beside it
  // still formats from the integer piasters, which is the figure of record.
  const payroll = comparison.rows.map((row) => ({
    name: row.branchName,
    value: piastersToPounds(row.payrollPiasters),
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={ar.reports.attendanceRate} data={attendance} unit="%" />
        <ChartCard title={ar.reports.payrollTotal} data={payroll} unit={ar.units.currency} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ar.payroll.branch}</TableHead>
              <TableHead>{ar.payroll.sessions}</TableHead>
              <TableHead>{ar.reports.recorded}</TableHead>
              <TableHead>{ar.reports.attendanceRate}</TableHead>
              <TableHead>{ar.reports.payrollTotal}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.rows.map((row) => (
              <TableRow key={row.branchId}>
                <TableCell className="font-medium">{row.branchName}</TableCell>
                <TableCell>{row.sessions}</TableCell>
                <TableCell>{row.recorded}</TableCell>
                <TableCell dir="ltr">{row.attendancePercent}%</TableCell>
                <TableCell dir="ltr">{formatEGP(row.payrollPiasters)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  unit,
}: {
  title: string;
  data: { name: string; value: number }[];
  unit: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={56} />
              <Tooltip
                formatter={(value) => [`${String(value)} ${unit}`, title]}
                contentStyle={{ direction: "rtl", fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.name} className="fill-primary" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
