import { requirePermission } from "@/shared/actions/create-action";
import { withTenant } from "@/shared/db/with-tenant";
import { ar } from "@/shared/i18n/ar";
import { err, ok, type Result } from "@/shared/lib/result";
import { WEEK_DISPLAY_ORDER } from "@/shared/lib/time";
import { computePeriods, type ComputedPeriod } from "../../domain/compute-periods";
import { cellKey } from "../../domain/copy-timetable";
import {
  findClassRef,
  findScheduleSettings,
  listClassRefs,
  listSlotsForClass,
  listSubjectOptions,
  listTeacherOptions,
  type ClassRef,
  type SubjectOption,
  type TeacherOption,
} from "../../infrastructure/timetable.repository";

export type GridCell = {
  slotId: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
};

export type ClassTimetable = {
  classRef: ClassRef;
  /** Working days in display order — Saturday first, Friday off (WEEK_DISPLAY_ORDER). */
  days: number[];
  periods: ComputedPeriod[];
  /** Keyed `day:period`, so an empty cell is simply an absent key. */
  cells: Record<string, GridCell>;
  slotCount: number;
  /** False when the branch has not configured this track's bell schedule yet. */
  configured: boolean;
  teachers: TeacherOption[];
  subjects: SubjectOption[];
};

export type ClassPickerOption = { id: string; name: string };

/** Classes of the active branch, for the picker above the grid. */
export async function listTimetableClasses(): Promise<Result<ClassPickerOption[]>> {
  const auth = await requirePermission("timetable.read");
  if (!auth.ok) return auth;

  const rows = await withTenant(auth.data, (tx) => listClassRefs(auth.data, tx));
  const scoped = auth.data.branchId ? rows.filter((row) => row.branchId === auth.data.branchId) : rows;
  return ok(scoped.map((row) => ({ id: row.id, name: row.name })));
}

export async function getClassTimetable(classId: string): Promise<Result<ClassTimetable>> {
  const auth = await requirePermission("timetable.read");
  if (!auth.ok) return auth;

  return withTenant(auth.data, async (tx) => {
    // A class in another branch is not "forbidden" — RLS returns no row, so as far as
    // this request is concerned it does not exist (CLAUDE.md: 404, never 403).
    const classRef = await findClassRef(auth.data, tx, classId);
    if (!classRef) return err("NOT_FOUND", ar.errors.NOT_FOUND);

    const settings = await findScheduleSettings(auth.data, tx, classRef.branchId, classRef.track);
    const slots = await listSlotsForClass(auth.data, tx, classId);

    const periods = settings
      ? computePeriods({
          dayStartTime: settings.dayStartTime.slice(0, 5),
          periodDurationMin: settings.periodDurationMin,
          periodsCount: settings.periodsCount,
          breaks: settings.breaks,
        })
      : [];

    const cells: Record<string, GridCell> = {};
    for (const slot of slots) {
      cells[cellKey(slot.dayOfWeek, slot.periodNumber)] = {
        slotId: slot.id,
        subjectId: slot.subjectId,
        subjectName: slot.subjectName,
        teacherId: slot.teacherId,
        teacherName: slot.teacherName,
      };
    }

    return ok({
      classRef,
      days: WEEK_DISPLAY_ORDER.filter((day) => (settings?.workingDays ?? []).includes(day)),
      periods,
      cells,
      slotCount: slots.length,
      configured: settings !== null,
      teachers: await listTeacherOptions(auth.data, tx, classRef.branchId),
      subjects: await listSubjectOptions(auth.data, tx),
    });
  });
}

/** Used by the copy dialog: the other classes in this branch whose week could be copied. */
export async function listCopySources(targetClassId: string): Promise<Result<ClassPickerOption[]>> {
  const auth = await requirePermission("timetable.write");
  if (!auth.ok) return auth;
  if (!auth.data.branchId) return err("BRANCH_REQUIRED", ar.errors.BRANCH_REQUIRED);

  const rows = await withTenant(auth.data, (tx) => listClassRefs(auth.data, tx));
  return ok(
    rows
      .filter((row) => row.id !== targetClassId && row.branchId === auth.data.branchId)
      .map((row) => ({ id: row.id, name: row.name })),
  );
}
