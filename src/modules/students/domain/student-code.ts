/**
 * Student codes — `{BRANCHCODE}-{YY}-{seq5}`, e.g. `OBR-26-00042` (PROJECT_PLAN 7.5).
 *
 * A student code is the student's identity: it is printed on cards, read out over the
 * phone, and is half of the credential a parent uses on the public lookup page. It is
 * issued once and NEVER changes — not when they move class, not when they transfer to
 * another branch, not when they are archived and restored. That is why the branch
 * prefix is a snapshot of where they enrolled, not a pointer to where they are now.
 */

const PATTERN = /^([A-Z]{2,5})-(\d{2})-(\d{5})$/;

export type StudentCodeParts = {
  branchCode: string;
  /** Two-digit year, e.g. 26. */
  year: number;
  sequence: number;
};

export function formatStudentCode(parts: StudentCodeParts): string {
  if (!/^[A-Z]{2,5}$/.test(parts.branchCode)) {
    throw new Error(`Invalid branch code: ${parts.branchCode}`);
  }
  if (!Number.isInteger(parts.year) || parts.year < 0 || parts.year > 99) {
    throw new Error(`Invalid year: ${parts.year}`);
  }
  if (!Number.isInteger(parts.sequence) || parts.sequence < 1 || parts.sequence > 99_999) {
    throw new Error(`Sequence out of range: ${parts.sequence}`);
  }
  return `${parts.branchCode}-${String(parts.year).padStart(2, "0")}-${String(parts.sequence).padStart(5, "0")}`;
}

export function parseStudentCode(code: string): StudentCodeParts | null {
  const match = PATTERN.exec(code.trim().toUpperCase());
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return {
    branchCode: match[1],
    year: Number(match[2]),
    sequence: Number(match[3]),
  };
}

/** Normalizes what a parent types into the lookup box before it is matched. */
export function normalizeStudentCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** The two-digit year a code issued on `isoDate` should carry. */
export function academicYearOf(isoDate: string): number {
  return Number(isoDate.slice(2, 4));
}
