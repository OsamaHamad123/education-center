"use server";

import { requirePermission } from "@/shared/actions/create-action";
import { requestMetadata, writeAuditLog } from "@/shared/actions/audit";
import type { TenantContext } from "@/shared/auth/tenant-context";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { parseCsv, readHeaders, toCsv, toRows } from "@/shared/lib/csv";
import { academicYearOf, formatStudentCode } from "../../domain/student-code";
import {
  findBranchCode,
  insertStudent,
  listActiveClassesInBranch,
  listStudents,
  nextStudentSequence,
  openEnrollment,
} from "../../infrastructure/students.repository";
import { createStudentSchema } from "../schemas";

export type ImportRowResult = {
  lineNumber: number;
  fullName: string;
  className: string;
  /** Null when the row is importable. */
  error: string | null;
};

export type ImportPreview = {
  rows: ImportRowResult[];
  validCount: number;
  invalidCount: number;
};

/**
 * Parses and validates a CSV without writing anything (Phase 4: "preview & row-level
 * errors"). The person at the desk sees exactly which lines will be skipped and why
 * BEFORE anything is committed.
 */
export async function previewStudentImport(formData: FormData): Promise<Result<ImportPreview>> {
  const auth = await requirePermission("student.write");
  if (!auth.ok) return auth;
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const parsed = await parseUpload(formData);
  if (!parsed.ok) return parsed;

  const classesByName = await loadClassesByName(auth.data.branchId, auth.data);
  const rows = parsed.data.map((row) => validateRow(row, classesByName));

  return ok({
    rows,
    validCount: rows.filter((r) => r.error === null).length,
    invalidCount: rows.filter((r) => r.error !== null).length,
  });
}

/**
 * Imports the valid rows and skips the rest, in ONE transaction: a CSV that fails
 * halfway must not leave a half-filled register behind.
 */
export async function importStudents(
  formData: FormData,
): Promise<Result<{ imported: number; skipped: number }>> {
  const auth = await requirePermission("student.write");
  if (!auth.ok) return auth;
  const branchId = auth.data.branchId;
  if (!branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const parsed = await parseUpload(formData);
  if (!parsed.ok) return parsed;

  const classesByName = await loadClassesByName(branchId, auth.data);
  const checked = parsed.data.map((row) => ({ row, result: validateRow(row, classesByName) }));
  const importable = checked.filter((entry) => entry.result.error === null);

  if (importable.length === 0) return err("VALIDATION_ERROR", ar.students.importNothing);

  const imported = await withTenant(auth.data, async (tx) => {
    const branchCode = await findBranchCode(auth.data, tx, branchId);
    if (!branchCode) throw new Error("branch vanished mid-import");

    let count = 0;
    for (const entry of importable) {
      const input = createStudentSchema.parse({
        fullName: entry.row.values.full_name,
        classId: classesByName.get(normalizeName(entry.row.values.class_name ?? ""))?.id,
        parentPhone: entry.row.values.parent_phone,
        parentWhatsapp: entry.row.values.parent_whatsapp || undefined,
        studentPhone: entry.row.values.student_phone || undefined,
        nationalId: entry.row.values.national_id || undefined,
        joinDate: entry.row.values.join_date,
        confirmDuplicate: true, // the preview already showed them the file
      });

      const year = academicYearOf(input.joinDate);
      const sequence = await nextStudentSequence(auth.data, tx, branchId, year);

      const student = await insertStudent(auth.data, tx, {
        studentCode: formatStudentCode({ branchCode, year, sequence }),
        fullName: input.fullName,
        studentPhone: input.studentPhone,
        studentWhatsapp: input.studentWhatsapp,
        parentPhone: input.parentPhone,
        parentWhatsapp: input.parentWhatsapp,
        nationalId: input.nationalId,
        branchId,
        classId: input.classId,
        joinDate: input.joinDate,
      });

      await openEnrollment(auth.data, tx, {
        studentId: student.id,
        branchId,
        classId: input.classId,
        startDate: input.joinDate,
      });
      count++;
    }

    await writeAuditLog(
      tx,
      auth.data,
      { action: "create", entity: "student.import", entityId: String(count) },
      await requestMetadata(),
    );

    return count;
  });

  return ok({ imported, skipped: checked.length - importable.length });
}

/** CSV of the students currently visible to the caller. */
export async function exportStudentsCsv(status: "active" | "archived"): Promise<Result<string>> {
  const auth = await requirePermission("student.read");
  if (!auth.ok) return auth;

  const { rows } = await withTenant(auth.data, (tx) =>
    listStudents(auth.data, tx, { status, page: 1, pageSize: 5000 }),
  );

  return ok(
    toCsv(
      ["student_code", "full_name", "class_name", "branch_name", "parent_phone", "join_date"],
      rows.map((row) => [
        row.studentCode,
        row.fullName,
        row.className,
        row.branchName,
        row.parentPhone,
        row.joinDate,
      ]),
    ),
  );
}

// ---------------------------------------------------------------------------

const MAX_CSV_BYTES = 2 * 1024 * 1024;

async function parseUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return err("VALIDATION_ERROR", ar.students.importNothing);
  }
  if (file.size > MAX_CSV_BYTES) {
    // Was `ar.settings.logoTooLarge`, so somebody importing a register was told their
    // LOGO was too big (docs/AUDIT-2026-09.md, finding 11).
    return err("VALIDATION_ERROR", ar.students.importTooLarge);
  }

  const rows = parseCsv(await file.text());
  const headers = readHeaders(rows);
  if (!headers.ok) {
    return err("VALIDATION_ERROR", `${ar.students.importDescription} (${headers.missing.join(", ")})`);
  }

  return ok(
    toRows(
      rows,
      (rows[0] ?? []).map((h) => h.trim().toLowerCase()),
    ),
  );
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function loadClassesByName(branchId: string, ctx: TenantContext) {
  const options = await withTenant(ctx, (tx) => listActiveClassesInBranch(ctx, tx, branchId));
  return new Map(options.map((option) => [normalizeName(option.name), option]));
}

function validateRow(
  row: { lineNumber: number; values: Record<string, string> },
  classesByName: Map<string, { id: string }>,
): ImportRowResult {
  const fullName = row.values.full_name ?? "";
  const className = row.values.class_name ?? "";
  const klass = classesByName.get(normalizeName(className));

  const base = { lineNumber: row.lineNumber, fullName, className };

  if (!klass) return { ...base, error: ar.students.errors.classNotInBranch };

  const parsed = createStudentSchema.safeParse({
    fullName,
    classId: klass.id,
    parentPhone: row.values.parent_phone,
    parentWhatsapp: row.values.parent_whatsapp || undefined,
    studentPhone: row.values.student_phone || undefined,
    nationalId: row.values.national_id || undefined,
    joinDate: row.values.join_date,
    confirmDuplicate: true,
  });

  if (!parsed.success) {
    return { ...base, error: parsed.error.issues[0]?.message ?? ar.errors.VALIDATION_ERROR };
  }

  return { ...base, error: null };
}
