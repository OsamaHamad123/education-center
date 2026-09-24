import { notFound } from "next/navigation";
import { z } from "zod";
import type { Metadata } from "next";
import { getStudentMarks, StudentMarksList } from "@/modules/assessments";
import { listVisibleBranches } from "@/modules/branches";
import { listClassOptions, type ClassOption } from "@/modules/classes";
import { getStudentProfile, StudentProfileView } from "@/modules/students";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

export const metadata: Metadata = { title: ar.students.profile };

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A non-UUID segment would reach Postgres, fail to cast and surface as a 500 —
  // an error page nobody wrote, and a difference an attacker can measure against
  // the 404 a foreign id gets (docs/SECURITY-REVIEW.md, finding 5).
  if (!z.uuid().safeParse(id).success) notFound();
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

  // Their marks, under the profile (`drizzle/0021`). A second read rather than part
  // of `getStudentProfile`: grades are their own module and their own permission, and
  // a profile that could not load because of a marks query would be a bad trade.
  const marks = hasPermission(user.role, "assessment.read") ? await getStudentMarks(id) : null;

  return (
    <div className="space-y-6">
      <StudentProfileView
        profile={profile.data}
        classes={classes.ok ? classes.data : []}
        branches={branchOptions}
        classesByBranch={classesByBranch}
        canTransferBranch={canTransferBranch}
        canWrite={hasPermission(user.role, "student.write")}
      />

      {marks?.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar.assessments.title}</CardTitle>
            <CardDescription>{ar.assessments.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <StudentMarksList marks={marks.data} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
