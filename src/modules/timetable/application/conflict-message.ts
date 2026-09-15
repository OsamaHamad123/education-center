import { ar } from "@/shared/i18n/ar";
import type { RedactedConflict } from "../domain/conflicts";

/**
 * The Arabic sentence for a conflict the viewer is allowed to read.
 *
 * `redactConflict` has already decided WHAT may be said; this only decides how to say
 * it. Keeping the two apart matters: adding a name here that the redaction stripped
 * would reintroduce the leak, and this file has no access to one.
 */
export function conflictMessage(conflict: RedactedConflict): string {
  if (conflict.kind === "class_busy") return ar.timetable.conflictClassBusy;

  switch (conflict.detail) {
    case "same_branch":
      return `${ar.timetable.conflictTeacherSameBranch} ${conflict.className} (${ar.timetable.period} ${conflict.periodNumber}).`;
    case "other_branch":
      return `${ar.timetable.conflictTeacherOtherBranch} ${conflict.branchName} — ${conflict.className}.`;
    case "none":
      // Deliberately the whole message: no branch, no class, no period. A branch admin
      // must not be able to map another branch's week by probing cells (rule 10.4).
      return ar.timetable.conflictTeacherHidden;
  }
}
