/**
 * Branch rules (PROJECT_PLAN 10.1). Pure TypeScript: no framework, no database.
 * The use cases supply the facts; this file decides.
 */

export type BranchDeactivationFacts = {
  activeStudentCount: number;
  activeBranchCount: number;
  isCurrentlyActive: boolean;
};

export type BranchRuleViolation =
  "BRANCH_ALREADY_INACTIVE" | "LAST_ACTIVE_BRANCH" | "CODE_LOCKED_BY_STUDENTS";

/**
 * Deactivating hides a branch from switchers and blocks its admins from signing in,
 * but keeps every row (rule 10.1) — so students are not an obstacle. Being the last
 * active branch is: a center with no active branch has nowhere to put a session, and
 * a super admin would have nothing to select.
 */
export function canDeactivateBranch(facts: BranchDeactivationFacts): BranchRuleViolation | null {
  if (!facts.isCurrentlyActive) return "BRANCH_ALREADY_INACTIVE";
  if (facts.activeBranchCount <= 1) return "LAST_ACTIVE_BRANCH";
  return null;
}

/**
 * The branch code is embedded in every student code ever issued (`OBR-26-00042`), and
 * those codes never change — not even on transfer. So once a student exists, the code
 * is frozen: editing it would leave the codes pointing at a branch prefix that no
 * longer exists.
 */
export function canChangeBranchCode(facts: { studentCount: number }): BranchRuleViolation | null {
  return facts.studentCount > 0 ? "CODE_LOCKED_BY_STUDENTS" : null;
}

/** Codes are stored upper-case; the form accepts any case. */
export function normalizeBranchCode(code: string): string {
  return code.trim().toUpperCase();
}
