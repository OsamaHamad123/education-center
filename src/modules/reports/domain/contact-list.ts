/**
 * Today's absences, grouped into one row per FAMILY (P4b).
 *
 * The rule the portal plan states — *one message a day, after the last period, naming
 * the periods missed* — is usually described as needing a messaging provider. It does
 * not. It needs this function and a screen.
 *
 * A child absent in three periods must be one message naming three periods, not three
 * messages. Two siblings absent the same day must be one message, not two. Both fall out
 * of grouping on the parent's phone, which is the same identity the portal signs in with:
 * a family IS a phone number in this product.
 *
 * Pure, so the rule is tested without a database and cannot drift when the query changes.
 */

export type AbsenceMark = {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  parentPhone: string;
  status: "absent" | "late";
  subjectName: string;
  periodNumber: number;
  /** How many times this student has been absent so far this month, today included. */
  monthAbsences: number;
};

export type ContactChild = {
  studentId: string;
  studentCode: string;
  fullName: string;
  className: string;
  monthAbsences: number;
  periods: { subjectName: string; periodNumber: number; status: "absent" | "late" }[];
};

export type ContactFamily = {
  /** The grouping key, and the only thing that makes siblings one row. */
  parentPhone: string;
  children: ContactChild[];
  /** True when any child is past the repeat threshold — picks the firmer template. */
  repeated: boolean;
};

/**
 * Absences this month at which the message stops being "he was not in today" and starts
 * being a conversation. Three is a pattern; two is a bad week.
 */
export const REPEATED_ABSENCE_THRESHOLD = 3;

export function groupByFamily(marks: AbsenceMark[]): ContactFamily[] {
  const families = new Map<string, Map<string, ContactChild>>();

  for (const mark of marks) {
    const children = families.get(mark.parentPhone) ?? new Map<string, ContactChild>();
    const child = children.get(mark.studentId) ?? {
      studentId: mark.studentId,
      studentCode: mark.studentCode,
      fullName: mark.fullName,
      className: mark.className,
      monthAbsences: mark.monthAbsences,
      periods: [],
    };

    child.periods.push({
      subjectName: mark.subjectName,
      periodNumber: mark.periodNumber,
      status: mark.status,
    });
    children.set(mark.studentId, child);
    families.set(mark.parentPhone, children);
  }

  return [...families.entries()]
    .map(([parentPhone, children]) => {
      const list = [...children.values()].map((child) => ({
        ...child,
        periods: [...child.periods].sort((a, b) => a.periodNumber - b.periodNumber),
      }));
      list.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));

      return {
        parentPhone,
        children: list,
        repeated: list.some((child) => child.monthAbsences >= REPEATED_ABSENCE_THRESHOLD),
      } satisfies ContactFamily;
    })
    .sort((a, b) => {
      // The families worth ringing first are the ones with a pattern, then the ones with
      // more than one child out. A worklist that is not ordered is a list, not a worklist.
      if (a.repeated !== b.repeated) return a.repeated ? -1 : 1;
      if (a.children.length !== b.children.length) return b.children.length - a.children.length;
      return (a.children[0]?.fullName ?? "").localeCompare(b.children[0]?.fullName ?? "", "ar");
    });
}

/** `رياضيات (الحصة ٢)، فيزياء (الحصة ٣)` — the `{الحصص}` placeholder's value. */
export function describePeriods(child: ContactChild, periodWord: string): string {
  return child.periods
    .map((period) => `${period.subjectName} (${periodWord} ${period.periodNumber})`)
    .join("، ");
}

/**
 * The `{الطالب}` `{الحصص}` `{مرات}` values for ONE family's message.
 *
 * A family with two children out gets one greeting and one signature, not two copies of
 * the whole message — so the names are joined and the periods are labelled with the
 * child's first name. Rendering the template twice would be easier and would read like a
 * machine wrote it, which is the thing the templates exist to avoid.
 */
export function familyTemplateValues(
  family: ContactFamily,
  periodWord: string,
): { الطالب: string; الحصص: string; مرات: string } {
  const children = family.children;
  const first = children[0];
  if (children.length === 1 && first) {
    return {
      الطالب: first.fullName,
      الحصص: describePeriods(first, periodWord),
      مرات: String(first.monthAbsences),
    };
  }

  return {
    الطالب: children.map((child) => child.fullName).join(" و"),
    الحصص: children
      .map((child) => `${firstName(child.fullName)}: ${describePeriods(child, periodWord)}`)
      .join(" — "),
    مرات: String(Math.max(...children.map((child) => child.monthAbsences), 0)),
  };
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
