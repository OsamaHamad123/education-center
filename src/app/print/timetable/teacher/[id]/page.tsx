import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { z } from "zod";
import { getCenterIdentity } from "@/modules/settings";
import { getTeacherProfile } from "@/modules/teachers";
import { getTeacherTimetable, TeacherTimetablePrint } from "@/modules/timetable";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { listVisibleBranches } from "@/modules/branches";

export const metadata: Metadata = { title: ar.print.teacherTimetable };

/**
 * One page, three audiences. The DATA is scoped by RLS inside the query — a branch
 * admin printing a teacher shared with two other branches gets their own branch's
 * periods only — so all this page decides is whose NAME to put on the header.
 */
export default async function PrintTeacherTimetablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  if (!user || !ctx) notFound();

  // A teacher may print their own week and no one else's.
  if (user.role === "teacher" && user.teacherId !== id) notFound();

  const [timetable, identity] = await Promise.all([getTeacherTimetable(id), getCenterIdentity()]);
  if (!timetable.ok || !identity.ok) notFound();

  const teacherName = await resolveName(user.role, user.name, id);
  if (teacherName === null) notFound();

  const branches = await listVisibleBranches();
  const branchName =
    (ctx.branchId && branches.ok ? branches.data.find((branch) => branch.id === ctx.branchId) : null)?.name ??
    null;

  return (
    <TeacherTimetablePrint
      timetable={timetable.data}
      teacherName={teacherName}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
      branchName={branchName}
    />
  );
}

async function resolveName(role: string, ownName: string, teacherId: string): Promise<string | null> {
  if (role === "teacher") return ownName;

  const profile = await getTeacherProfile(teacherId);
  return profile.ok ? profile.data.teacher.fullName : null;
}
