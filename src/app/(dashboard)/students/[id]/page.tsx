import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listVisibleBranches } from "@/modules/branches";
import { listClassOptions, type ClassOption } from "@/modules/classes";
import { getStudentProfile, StudentProfileView } from "@/modules/students";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.students.profile };

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  const profile = await getStudentProfile(id);
  // A student in another branch is NOT_FOUND, never FORBIDDEN — the id must not
  // confirm that it exists somewhere (CLAUDE.md, "Multi-branch isolation").
  if (!profile.ok || !user) notFound();

  const canTransferBranch = hasPermission(user.role, "student.transfer_branch");
  const [classes, branches] = await Promise.all([
    listClassOptions(profile.data.student.branchId),
    canTransferBranch ? listVisibleBranches() : Promise.resolve(null),
  ]);

  // The transfer dialog needs the classes of every branch it might move them to.
  const branchOptions = branches?.ok ? branches.data : [];
  const classesByBranch: Record<string, ClassOption[]> = {};
  if (canTransferBranch) {
    const lists = await Promise.all(
      branchOptions.map(async (branch) => [branch.id, await listClassOptions(branch.id)] as const),
    );
    for (const [branchId, result] of lists) {
      classesByBranch[branchId] = result.ok ? result.data : [];
    }
  }

  return (
    <StudentProfileView
      profile={profile.data}
      classes={classes.ok ? classes.data : []}
      branches={branchOptions}
      classesByBranch={classesByBranch}
      canTransferBranch={canTransferBranch}
      canWrite={hasPermission(user.role, "student.write")}
    />
  );
}
