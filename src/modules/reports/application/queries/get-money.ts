import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { err, ok, type Result } from "@/shared/lib/result";
import { ar } from "@/shared/i18n/ar";
import { todayInCairo } from "@/shared/lib/time";
import { moneyByBranch, type BranchMoneyRow } from "../../infrastructure/reports.repository";

/**
 * The owner's own question (docs/ROADMAP.md, item 2).
 *
 * `/fees` and `/payroll/runs` both refuse "كافة الفروع", and correctly: a till belongs
 * to one desk, and money is collected and paid out in one branch at a time. But the
 * consequence was that the question the OWNER actually asks — how much did the centre
 * collect this month, and what does it owe its teachers — had no screen at all. They
 * would switch branch three times and add it up on paper.
 *
 * So this is read-only and cross-branch, the same shape as the branch comparison report
 * that already exists for attendance. Nothing here can take or pay money.
 */

export type MoneyReport = {
  period: string;
  branches: BranchMoneyRow[];
  totals: {
    billedPiasters: number;
    collectedPiasters: number;
    outstandingPiasters: number;
    payrollComputedPiasters: number;
    payrollPaidPiasters: number;
  };
};

export async function getMoneyReport(input: { period?: string | undefined }): Promise<Result<MoneyReport>> {
  // Cross-branch, so the same permission the branch comparison uses: this is the
  // centre's view, and a branch admin has no business with another branch's takings.
  const auth = await requirePermission("report.cross_branch");
  if (!auth.ok) return auth;
  if (!(await hasFeeAccess())) return err("FORBIDDEN", ar.errors.FORBIDDEN);

  const period = isPeriod(input.period) ? input.period : todayInCairo().slice(0, 7);

  return withTenant(auth.data, async (tx) => {
    const branches = await moneyByBranch(auth.data, tx, period);

    return ok({
      period,
      branches,
      totals: {
        billedPiasters: sum(branches, (row) => row.billedPiasters),
        collectedPiasters: sum(branches, (row) => row.collectedPiasters),
        outstandingPiasters: sum(branches, (row) => row.outstandingPiasters),
        payrollComputedPiasters: sum(branches, (row) => row.payrollComputedPiasters),
        payrollPaidPiasters: sum(branches, (row) => row.payrollPaidPiasters),
      },
    });
  });
}

/** Reading the money also needs the money permission, not only the cross-branch one. */
async function hasFeeAccess(): Promise<boolean> {
  return (await requirePermission("fee.read")).ok;
}

function sum(rows: readonly BranchMoneyRow[], pick: (row: BranchMoneyRow) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function isPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
