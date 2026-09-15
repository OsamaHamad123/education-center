/**
 * Class rules (PROJECT_PLAN 10.2). Pure: the use case supplies the facts.
 */

export type ClassRuleViolation = "TRACK_LOCKED_BY_SESSIONS" | "HAS_ACTIVE_STUDENTS" | "ALREADY_INACTIVE";

/**
 * A session snapshots the class's track and the teacher's rate FOR THAT TRACK, so a
 * class that switched from scientific to literary would leave payroll unable to
 * explain its own history. Create a new class instead.
 */
export function canChangeTrack(facts: { sessionCount: number }): ClassRuleViolation | null {
  return facts.sessionCount > 0 ? "TRACK_LOCKED_BY_SESSIONS" : null;
}

/**
 * Deactivating a class with students in it would strand them: they would keep an open
 * enrollment pointing at a class that no longer appears anywhere. Move them first.
 */
export function canDeactivateClass(facts: {
  activeStudentCount: number;
  isCurrentlyActive: boolean;
}): ClassRuleViolation | null {
  if (!facts.isCurrentlyActive) return "ALREADY_INACTIVE";
  if (facts.activeStudentCount > 0) return "HAS_ACTIVE_STUDENTS";
  return null;
}
