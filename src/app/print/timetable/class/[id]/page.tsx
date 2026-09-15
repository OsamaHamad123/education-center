import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { listVisibleBranches } from "@/modules/branches";
import { getCenterIdentity } from "@/modules/settings";
import { ClassTimetablePrint, getClassTimetable } from "@/modules/timetable";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.print.classTimetable };

export default async function PrintClassTimetablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // An id that is not a UUID never reaches the database (PROJECT_PLAN 13.1).
  if (!z.uuid().safeParse(id).success) notFound();

  const [timetable, identity, branches] = await Promise.all([
    getClassTimetable(id),
    getCenterIdentity(),
    listVisibleBranches(),
  ]);
  // A class in another branch returns NOT_FOUND from the query, and so does this page.
  if (!timetable.ok || !identity.ok) notFound();

  const branchName =
    (branches.ok ? branches.data.find((branch) => branch.id === timetable.data.classRef.branchId) : null)
      ?.name ?? null;

  return (
    <ClassTimetablePrint
      timetable={timetable.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
    />
  );
}
