/**
 * What a teacher is owed (PROJECT_PLAN 10.6).
 *
 * Every figure here comes from a SNAPSHOT taken when the lesson ran —
 * `rate_applied_piasters` and `track_applied` on `class_sessions` — never from the
 * teacher's current rate. That is the whole reason those columns exist: raising a
 * rate today must not change what was earned last month.
 *
 * Two rules, and both are easy to get wrong:
 *   * only `completed` sessions are paid; a cancelled one keeps its attendance but
 *     leaves payroll entirely (rule 10.5);
 *   * everything is integer piasters. No float touches money at any point.
 *
 * The production report aggregates in SQL, because summing thousands of rows in
 * JavaScript is not a plan. This function is still the definition of the rules, and
 * an integration test runs both over the same sessions and asserts they agree.
 */

export type Track = "scientific" | "literary";

/** Exactly the shape PROJECT_PLAN 10.6 specifies. */
export type PayrollSession = {
  track: Track;
  ratePiasters: number;
  status: "completed" | "cancelled";
  branchId: string;
};

export type TrackTotals = {
  sessions: number;
  amountPiasters: number;
};

export type BranchEarnings = {
  branchId: string;
  scientific: TrackTotals;
  literary: TrackTotals;
  sessions: number;
  amountPiasters: number;
};

export type Earnings = {
  branches: BranchEarnings[];
  sessions: number;
  amountPiasters: number;
};

export function calculateEarnings(sessions: readonly PayrollSession[]): Earnings {
  const byBranch = new Map<string, BranchEarnings>();

  for (const session of sessions) {
    // A cancelled session is not a zero-value session — it is not a session at all,
    // as far as money is concerned. Counting it as zero would still inflate counts.
    if (session.status !== "completed") continue;
    assertPiasters(session.ratePiasters);

    const branch = byBranch.get(session.branchId) ?? emptyBranch(session.branchId);
    const track = branch[session.track];
    track.sessions += 1;
    track.amountPiasters += session.ratePiasters;
    branch.sessions += 1;
    branch.amountPiasters += session.ratePiasters;
    byBranch.set(session.branchId, branch);
  }

  const branches = [...byBranch.values()].sort((a, b) => a.branchId.localeCompare(b.branchId));

  return {
    branches,
    sessions: branches.reduce((total, branch) => total + branch.sessions, 0),
    amountPiasters: branches.reduce((total, branch) => total + branch.amountPiasters, 0),
  };
}

/**
 * Rolls several teachers' earnings into one grand total, for the report footer.
 * Separate from `calculateEarnings` so the per-teacher figures stay the source and
 * the total is visibly derived from them rather than computed a second way.
 */
export function grandTotal(earnings: readonly Earnings[]): TrackTotals {
  return {
    sessions: earnings.reduce((total, item) => total + item.sessions, 0),
    amountPiasters: earnings.reduce((total, item) => total + item.amountPiasters, 0),
  };
}

function emptyBranch(branchId: string): BranchEarnings {
  return {
    branchId,
    scientific: { sessions: 0, amountPiasters: 0 },
    literary: { sessions: 0, amountPiasters: 0 },
    sessions: 0,
    amountPiasters: 0,
  };
}

function assertPiasters(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`A session rate must be a non-negative integer of piasters, got: ${value}`);
  }
}
