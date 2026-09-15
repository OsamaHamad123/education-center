import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listVisibleBranches } from "@/modules/branches";
import {
  LinkTeacherDialog,
  listTeachersForViewer,
  TeacherFormDialog,
  TeachersTable,
} from "@/modules/teachers";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser, resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.teachers.title };

export default async function TeachersPage() {
  const user = await getSessionUser();
  const ctx = await resolveTenantContext();
  const [teachers, branches] = await Promise.all([listTeachersForViewer(), listVisibleBranches()]);
  if (!teachers.ok || !user || !ctx) notFound();

  const canManage = hasPermission(user.role, "teacher.manage");
  const canLink = hasPermission(user.role, "teacher.link_branch");

  return (
    <>
      <PageHeader
        title={ar.teachers.title}
        description={canManage ? ar.teachers.description : ar.teachers.descriptionBranch}
        action={
          <div className="flex flex-wrap gap-2">
            {/* Linking is branch-scoped, so it needs a branch selected. */}
            {canLink && ctx.branchId ? <LinkTeacherDialog /> : null}
            {canManage ? (
              <TeacherFormDialog
                branches={branches.ok ? branches.data : []}
                trigger={
                  <Button>
                    <Plus className="size-4" aria-hidden />
                    {ar.teachers.add}
                  </Button>
                }
              />
            ) : null}
          </div>
        }
      />
      <TeachersTable
        teachers={teachers.data}
        branches={branches.ok ? branches.data : []}
        canManage={canManage}
      />
    </>
  );
}
