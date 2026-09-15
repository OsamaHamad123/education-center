import { requirePermission } from "@/shared/actions/create-action";
import type { Student } from "@/shared/db/schema";
import { withTenant } from "@/shared/db/with-tenant";
import { err, ok, type Result } from "@/shared/lib/result";
import { ar } from "@/shared/i18n/ar";
import {
  findStudentById,
  listEnrollmentHistory,
  type EnrollmentHistoryRow,
} from "../../infrastructure/students.repository";

export type StudentProfile = {
  student: Student;
  history: EnrollmentHistoryRow[];
  /** True when this student now belongs to a different branch than the viewer's. */
  transferredOut: boolean;
};

export async function getStudentProfile(id: string): Promise<Result<StudentProfile>> {
  const auth = await requirePermission("student.read");
  if (!auth.ok) return auth;

  const profile = await withTenant(auth.data, async (tx) => {
    const student = await findStudentById(auth.data, tx, id);
    if (!student) return null;
    return {
      student,
      history: await listEnrollmentHistory(auth.data, tx, id),
      transferredOut: auth.data.branchId !== null && student.branchId !== auth.data.branchId,
    };
  });

  // RLS returns nothing for a student in a branch the caller cannot read, so a
  // foreign id is indistinguishable from a missing one — which is the point.
  if (!profile) return err("NOT_FOUND", ar.errors.NOT_FOUND);
  return ok(profile);
}

export type { EnrollmentHistoryRow };
