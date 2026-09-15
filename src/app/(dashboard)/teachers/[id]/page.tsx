import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTeacherProfile, TeacherProfileView } from "@/modules/teachers";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.teachers.profile };

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  const profile = await getTeacherProfile(id);
  // A teacher not linked to the caller's branch is NOT_FOUND, never FORBIDDEN.
  if (!profile.ok || !user || !ctx) notFound();

  return (
    <TeacherProfileView
      profile={profile.data}
      canSeeRates={hasPermission(user.role, "teacher.manage")}
      canLink={hasPermission(user.role, "teacher.link_branch")}
      viewerBranchId={ctx.branchId}
    />
  );
}
