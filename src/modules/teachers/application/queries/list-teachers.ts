import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import { listTeachers as listTeachersRepo, type TeacherRow } from "../../infrastructure/teachers.repository";

export async function listTeachersForViewer(): Promise<Result<TeacherRow[]>> {
  const auth = await requirePermission("teacher.read");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listTeachersRepo(auth.data, tx));
  return ok(rows);
}

export type { TeacherRow };
