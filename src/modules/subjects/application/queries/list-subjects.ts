import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import {
  listSubjects as listSubjectsRepo,
  type SubjectWithUsage,
} from "../../infrastructure/subjects.repository";

/** The global subject list, with how heavily each one is used. */
export async function listSubjectsForAdmin(): Promise<Result<SubjectWithUsage[]>> {
  const auth = await requirePermission("subject.manage");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listSubjectsRepo(auth.data, tx));
  return ok(rows);
}

export type { SubjectWithUsage };
