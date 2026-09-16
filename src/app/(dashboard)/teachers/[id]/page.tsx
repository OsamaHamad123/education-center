import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { getTeacherProfile, TeacherProfileView } from "@/modules/teachers";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.teachers.profile };

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A non-UUID segment would reach Postgres, fail to cast and surface as a 500 —
  // an error page nobody wrote, and a difference an attacker can measure against
  // the 404 a foreign id gets (docs/SECURITY-REVIEW.md, finding 5).
  if (!z.uuid().safeParse(id).success) notFound();
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
