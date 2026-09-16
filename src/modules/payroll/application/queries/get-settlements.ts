import { requirePermission } from "@/shared/actions/create-action";
import type { TenantContext } from "@/shared/auth/tenant-context";
import type { Tx } from "@/shared/db/client";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { todayInCairo } from "@/shared/lib/time";
import { isSettled, paidTotal, settlementState, type SettlementState } from "../../domain/settlement";
import {
  aggregateEarnings,
  listRunsFor,
  listRunsForPeriod,
  listRunsForTeacher,
  type RunRow,
} from "../../infrastructure/payroll.repository";

/**
 * Reading the settlements (`drizzle/0016`).
 *
 * The month's computed figure and what was actually handed over, side by side — which
 * is the only way the `stale` case is visible at all: a register corrected after the
 * money went out.
 */

export type SettlementRow = {
  teacherId: string;
  teacherName: string;
  branchId: string;
  branchName: string | null;
  computedPiasters: number;
  sessions: number;
  paidPiasters: number;
  state: SettlementState;
  runs: RunRow[];
};

export type SettlementsView = {
  period: string;
  rows: SettlementRow[];
  totalComputed: number;
  totalPaid: number;
};

export async function getSettlements(input: {
  period?: string | undefined;
}): Promise<Result<SettlementsView>> {
  // `payroll.settle`, not `payroll.read`: a teacher may read what they have EARNED and
  // what they have been paid, and has no business on the screen that decides either.
  const auth = await requirePermission("payroll.settle");
  if (!auth.ok) return auth;
  // Settling is a branch's act: it pays its own teachers for its own lessons.
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const period = isPeriod(input.period) ? input.period : todayInCairo().slice(0, 7);

  return withTenant(auth.data, async (tx) => {
    const groups = await aggregateEarnings(auth.data, tx, {
      from: `${period}-01`,
      to: endOfPeriod(period),
      branchId: auth.data.branchId ?? undefined,
    });
    const runsByPair = await listRunsForPeriod(auth.data, tx, period);

    // Teacher × branch, summed across tracks — the grain a settlement is recorded at.
    const byPair = new Map<string, SettlementRow>();
    for (const group of groups) {
      const key = `${group.branchId}:${group.teacherId}`;
      const row = byPair.get(key) ?? {
        teacherId: group.teacherId,
        teacherName: group.teacherName,
        branchId: group.branchId,
        branchName: group.branchName,
        computedPiasters: 0,
        sessions: 0,
        paidPiasters: 0,
        state: "unsettled" as SettlementState,
        runs: runsByPair.get(key) ?? [],
      };
      row.computedPiasters += group.amountPiasters;
      row.sessions += group.sessions;
      byPair.set(key, row);
    }

    // A teacher paid for a month whose sessions have since ALL been cancelled has no
    // earnings group at all, and would disappear from the screen holding the centre's
    // money. They belong on it more than anybody.
    for (const [key, runs] of runsByPair) {
      if (byPair.has(key) || runs.length === 0) continue;
      const first = runs[0];
      if (!first) continue;
      byPair.set(key, {
        teacherId: first.teacherId,
        teacherName: "",
        branchId: first.branchId,
        branchName: null,
        computedPiasters: 0,
        sessions: 0,
        paidPiasters: 0,
        state: "unsettled",
        runs,
      });
    }

    const rows = [...byPair.values()]
      .map((row) => ({
        ...row,
        paidPiasters: paidTotal(row.runs),
        state: settlementState(row.runs, row.computedPiasters),
      }))
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "ar"));

    return ok({
      period,
      rows,
      totalComputed: rows.reduce((total, row) => total + row.computedPiasters, 0),
      totalPaid: rows.reduce((total, row) => total + row.paidPiasters, 0),
    });
  });
}

/** A teacher's own payout history, for the "شهر ٨: مدفوع" line on their screen. */
export async function getMyPayouts(teacherId: string) {
  const auth = await requirePermission("payroll.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    const runs = await listRunsForTeacher(auth.data, tx, teacherId);

    // One line per month, reversals netted: a teacher wants "was I paid for August",
    // not a ledger.
    const byPeriod = new Map<string, { period: string; paidPiasters: number; paidAt: Date }>();
    for (const run of runs) {
      const entry = byPeriod.get(run.period) ?? {
        period: run.period,
        paidPiasters: 0,
        paidAt: run.paidAt,
      };
      entry.paidPiasters += run.amountPiasters;
      if (run.paidAt > entry.paidAt) entry.paidAt = run.paidAt;
      byPeriod.set(run.period, entry);
    }

    return ok([...byPeriod.values()].sort((a, b) => b.period.localeCompare(a.period)));
  });
}

/**
 * Whether a teacher's month is settled — the FREEZE the attendance guard asks about.
 *
 * Exported through the module's public API and called inside the caller's transaction,
 * because the answer has to be the one that is true at the moment the register is
 * written, not a moment earlier.
 */
export async function isPeriodSettled(
  ctx: TenantContext,
  tx: Tx,
  branchId: string,
  teacherId: string,
  sessionDate: string,
): Promise<boolean> {
  const runs = await listRunsFor(ctx, tx, branchId, teacherId, sessionDate.slice(0, 7));
  return isSettled(runs);
}

function isPeriod(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function endOfPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, "0")}`;
}
