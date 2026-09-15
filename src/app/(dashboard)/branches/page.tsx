import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { BranchesTable, BranchFormDialog, listBranchesForAdmin } from "@/modules/branches";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.branches.title };

/**
 * Thin page: it asks the module for data and renders. No business logic here
 * (CLAUDE.md, architecture rule 2).
 */
export default async function BranchesPage() {
  const result = await listBranchesForAdmin();
  // A branch admin has no link here, and typing the URL gets them a 404 rather than
  // a 403 — consistent with how foreign records behave (CLAUDE.md). `forbidden()`
  // would need Next's experimental authInterrupts flag, and says more than we want to.
  if (!result.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.branches.title}
        description={ar.branches.description}
        action={
          <BranchFormDialog
            trigger={
              <Button>
                <Plus className="size-4" aria-hidden />
                {ar.branches.add}
              </Button>
            }
          />
        }
      />
      <BranchesTable branches={result.data} />
    </>
  );
}
