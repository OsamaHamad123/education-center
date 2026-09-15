import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listVisibleBranches } from "@/modules/branches";
import { BranchAdminsTable, CreateBranchAdminDialog, listBranchAdminsForAdmin } from "@/modules/users";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.users.title };

export default async function UsersPage() {
  const [admins, branches] = await Promise.all([listBranchAdminsForAdmin(), listVisibleBranches()]);
  if (!admins.ok) notFound();

  const branchOptions = branches.ok ? branches.data : [];

  return (
    <>
      <PageHeader
        title={ar.users.title}
        description={ar.users.description}
        action={
          branchOptions.length > 0 ? (
            <CreateBranchAdminDialog
              branches={branchOptions}
              trigger={
                <Button>
                  <Plus className="size-4" aria-hidden />
                  {ar.users.add}
                </Button>
              }
            />
          ) : (
            <p className="text-muted-foreground text-sm">{ar.users.noBranchesYet}</p>
          )
        }
      />
      <BranchAdminsTable admins={admins.data} />
    </>
  );
}
