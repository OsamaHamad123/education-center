/**
 * Settling a month, and what that then forbids (`drizzle/0016`).
 *
 * Pure. The rules here are read by the payroll screen, by the teacher's own screen and
 * by the attendance guard, so there is one definition of "this month is settled" rather
 * than three that drift.
 */

export type RunRow = {
  amountPiasters: number;
  sessionsCount: number;
  /** Non-null on a reversal, which carries a negative amount. */
  reversesId: string | null;
};

/** What the centre has actually paid for a (branch, teacher, month), reversals netted. */
export function paidTotal(runs: readonly RunRow[]): number {
  return runs.reduce((total, run) => total + run.amountPiasters, 0);
}

/**
 * A month is SETTLED when money is out the door and has not been taken back.
 *
 * Deliberately `> 0` rather than "a run exists": a settlement that was reversed leaves
 * two rows and no money, and the month must become editable again — otherwise a
 * mistaken payout would lock a register for ever.
 */
export function isSettled(runs: readonly RunRow[]): boolean {
  return paidTotal(runs) > 0;
}

export type SettlementState = "unsettled" | "settled" | "partial" | "stale";

/**
 * How a month reads on a screen.
 *
 * `stale` is the one worth having: the month was paid, and the register has been
 * corrected since so the computed figure no longer matches what was handed over. That
 * is not an error to hide — it is the discrepancy somebody has to look at, and the only
 * reason `sessions_count` is snapshotted at all.
 */
export function settlementState(runs: readonly RunRow[], computedPiasters: number): SettlementState {
  const paid = paidTotal(runs);
  if (paid <= 0) return "unsettled";
  if (paid === computedPiasters) return "settled";
  return paid < computedPiasters ? "partial" : "stale";
}

/** Why a settlement may be refused, or null when it may be recorded. */
export type SettlementProblem = "NOTHING_TO_PAY" | "ALREADY_SETTLED" | "FUTURE_PERIOD";

export function checkSettlement(input: {
  runs: readonly RunRow[];
  computedPiasters: number;
  period: string;
  currentPeriod: string;
}): SettlementProblem | null {
  // A month that has not finished has lessons still to run. Paying it early is not a
  // rounding problem, it is paying for work nobody has done yet.
  if (input.period > input.currentPeriod) return "FUTURE_PERIOD";
  if (input.computedPiasters <= 0) return "NOTHING_TO_PAY";
  if (isSettled(input.runs)) return "ALREADY_SETTLED";
  return null;
}

/**
 * Whether a register may still be edited, given the settlements for its teacher's month.
 *
 * This is the consequence that makes the record worth keeping: a month whose money has
 * been handed over stops being quietly rewritable. Reverse the settlement first — which
 * is a row somebody signs their name to — and the month opens again.
 */
export function canEditSettledPeriod(runs: readonly RunRow[]): boolean {
  return !isSettled(runs);
}

// --- paying everybody at once -------------------------------------------------

export type BulkCandidate = {
  teacherId: string;
  branchId: string;
  computedPiasters: number;
  sessions: number;
  /** That teacher's settlements for this month, reversals included. */
  runs: readonly RunRow[];
};

export type BulkSettlementPlan = {
  /** Exactly what will be written, one row per teacher. */
  toPay: { teacherId: string; branchId: string; amountPiasters: number; sessionsCount: number }[];
  /** Skipped because the money is already out the door. */
  alreadySettled: string[];
  /** Skipped because there is nothing owed — no lessons, or all of them cancelled. */
  nothingToPay: string[];
};

/**
 * "Pay everyone" as a plan, decided before anything is written.
 *
 * ONE ROW PER TEACHER, never a combined one. `payroll_runs` is keyed on (branch,
 * teacher, month) because that is the grain a reversal has to work at: a clerk who
 * paid Khaled the wrong amount must be able to undo Khaled without unpicking the
 * other eight. A single row for the branch would make the reversal of one mistake a
 * reversal of the payroll.
 *
 * It SKIPS rather than fails. A month where seven of nine are owed something and two
 * were already paid is the ordinary state of a payroll run, not an error — and an
 * all-or-nothing rule would mean the office could never use the button twice. Both
 * skip lists are returned so the screen can say which, and why.
 */
export function planBulkSettlement(candidates: readonly BulkCandidate[]): BulkSettlementPlan {
  const plan: BulkSettlementPlan = { toPay: [], alreadySettled: [], nothingToPay: [] };

  for (const candidate of candidates) {
    // Same order as `checkSettlement`: already-paid is the more informative answer
    // when a teacher was paid and their lessons have since been cancelled.
    if (isSettled(candidate.runs)) {
      plan.alreadySettled.push(candidate.teacherId);
      continue;
    }
    if (candidate.computedPiasters <= 0) {
      plan.nothingToPay.push(candidate.teacherId);
      continue;
    }
    plan.toPay.push({
      teacherId: candidate.teacherId,
      branchId: candidate.branchId,
      amountPiasters: candidate.computedPiasters,
      sessionsCount: candidate.sessions,
    });
  }

  return plan;
}
