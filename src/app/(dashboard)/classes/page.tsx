import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { ClassesTable, ClassFormDialog, listClassesForBranch } from "@/modules/classes";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.classes.title };

export default async function ClassesPage() {
  const ctx = await resolveTenantContext();
  const result = await listClassesForBranch();
  if (!result.ok || !ctx) notFound();

  return (
    <>
      <PageHeader
        title={ar.classes.title}
        description={ar.classes.description}
        action={
          // Creating needs a branch, so in "كافة الفروع" mode there is nothing to add to.
          ctx.branchId ? (
            <ClassFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" aria-hidden />
                  {ar.classes.add}
                </Button>
              }
            />
          ) : null
        }
      />
      {ctx.branchId === null ? (
        <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.classes.description} />
      ) : (
        <ClassesTable classes={result.data} />
      )}
    </>
  );
}
