import { requirePermission } from "@/shared/actions/create-action";
import { PAGE_SIZE } from "@/shared/config/constants";
import { withTenant } from "@/shared/db/with-tenant";
import { ok, type Result } from "@/shared/lib/result";
import { listStudents as listStudentsRepo, type StudentRow } from "../../infrastructure/students.repository";
import { studentFiltersSchema } from "../schemas";

export type StudentsPage = {
  rows: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  status: "active" | "archived";
};

export async function listStudentsPage(
  rawFilters: Record<string, string | string[] | undefined>,
): Promise<Result<StudentsPage>> {
  const auth = await requirePermission("student.read");
  if (!auth.ok) return auth;

  const filters = studentFiltersSchema.parse(rawFilters);

  const { rows, total } = await withTenant(auth.data, (tx) =>
    listStudentsRepo(auth.data, tx, { ...filters, pageSize: PAGE_SIZE }),
  );

  return ok({ rows, total, page: filters.page, pageSize: PAGE_SIZE, status: filters.status });
}

export type { StudentRow };
