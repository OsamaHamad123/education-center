"use client";

import { ar } from "@/shared/i18n/ar";
import { formatEGP } from "@/shared/lib/money";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useNavPending } from "@/shared/ui/use-nav-pending";
import type { MoneyReport } from "../application/queries/get-money";

/**
 * The centre's money for a month, branch by branch (docs/ROADMAP.md, item 2).
 *
 * Read-only on purpose: money is collected and paid out at one desk, in one branch, and
 * this screen exists so the owner does not have to switch branch three times and add it
 * up on paper. There is nothing to press.
 *
 * The figure that matters is the last column. Collected minus paid out is what the month
 * actually left behind, and it is the only number on any screen in this product that
 * answers the question the owner asks first.
 */
export function MoneyReportView({ report }: { report: MoneyReport }) {
  const [isNavigating, navigate] = useNavPending();
  const net = report.totals.collectedPiasters - report.totals.payrollPaidPiasters;

  return (
    <div className="space-y-4">
      <fieldset
        disabled={isNavigating}
        aria-busy={isNavigating}
        className="max-w-xs space-y-1.5 transition-opacity disabled:opacity-60"
      >
        <Label htmlFor="money-period">{ar.fees.period}</Label>
        <Input
          id="money-period"
          type="month"
          value={report.period}
          dir="ltr"
          className="text-start"
          onChange={(event) => event.target.value && navigate(`?period=${event.target.value}`)}
        />
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={ar.fees.collected} piasters={report.totals.collectedPiasters} />
        <Figure label={ar.fees.outstanding} piasters={report.totals.outstandingPiasters} warn />
        <Figure label={ar.money.payrollPaid} piasters={report.totals.payrollPaidPiasters} />
        <Figure label={ar.money.net} piasters={net} strong />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-start">{ar.money.branch}</th>
              <th className="p-2 text-start">{ar.fees.billed}</th>
              <th className="p-2 text-start">{ar.fees.collected}</th>
              <th className="p-2 text-start">{ar.fees.outstanding}</th>
              <th className="p-2 text-start">{ar.money.payrollOwed}</th>
              <th className="p-2 text-start">{ar.money.payrollPaid}</th>
              <th className="p-2 text-start">{ar.money.net}</th>
            </tr>
          </thead>
          <tbody>
            {report.branches.map((row) => (
              <tr key={row.branchId} className="border-t">
                <td className="p-2 font-medium">{row.branchName}</td>
                <Money value={row.billedPiasters} />
                <Money value={row.collectedPiasters} />
                <Money value={row.outstandingPiasters} warn={row.outstandingPiasters > 0} />
                <Money value={row.payrollComputedPiasters} />
                <Money value={row.payrollPaidPiasters} />
                <Money value={row.collectedPiasters - row.payrollPaidPiasters} strong />
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/50 font-bold">
            <tr className="border-t">
              <td className="p-2">{ar.common.total}</td>
              <Money value={report.totals.billedPiasters} />
              <Money value={report.totals.collectedPiasters} />
              <Money value={report.totals.outstandingPiasters} />
              <Money value={report.totals.payrollComputedPiasters} />
              <Money value={report.totals.payrollPaidPiasters} />
              <Money value={net} />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">{ar.money.hint}</p>
    </div>
  );
}

function Money({ value, warn, strong }: { value: number; warn?: boolean; strong?: boolean }) {
  return (
    <td
      className={`p-2 ${warn && value > 0 ? "text-destructive" : ""} ${strong ? "font-medium" : ""}`}
      dir="ltr"
    >
      {formatEGP(value)}
    </td>
  );
}

function Figure({
  label,
  piasters,
  warn,
  strong,
}: {
  label: string;
  piasters: number;
  warn?: boolean;
  strong?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p
          className={`font-bold ${warn && piasters > 0 ? "text-destructive" : ""} ${
            strong ? "text-lg" : "text-base"
          }`}
          dir="ltr"
        >
          {formatEGP(piasters)}
        </p>
      </CardContent>
    </Card>
  );
}
