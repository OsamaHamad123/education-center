"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Power, PowerOff, Printer } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DataTable } from "@/shared/ui/data-table";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import { setBranchActive } from "../application/use-cases/manage-branch";
import type { BranchWithCounts } from "../application/queries/list-branches-admin";
import { BranchFormDialog } from "./branch-form";

export function BranchesTable({ branches }: { branches: BranchWithCounts[] }) {
  const router = useRouter();

  const columns: AppColumnDef<BranchWithCounts>[] = [
    { accessorKey: "name", header: ar.branches.name },
    {
      accessorKey: "code",
      header: ar.branches.code,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
    },
    { accessorKey: "studentCount", header: ar.branches.students },
    { accessorKey: "adminCount", header: ar.branches.admins },
    {
      accessorKey: "isActive",
      header: ar.branches.status,
      cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />,
    },
    {
      accessorKey: "portalEnabled",
      header: ar.branches.portalColumn,
      cell: ({ row }) => <PortalBadge enabled={row.original.portalEnabled} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <RowActions branch={row.original} onDone={() => router.refresh()} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={branches}
      getRowId={(branch) => branch.id}
      searchColumn="name"
      searchPlaceholder={ar.branches.name}
      emptyTitle={ar.branches.empty}
      emptyDescription={ar.branches.emptyHint}
      renderCard={(branch) => (
        <Card>
          <CardContent className="flex items-start justify-between gap-3 pt-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{branch.name}</span>
                <span className="text-muted-foreground font-mono text-xs">{branch.code}</span>
              </div>
              <p className="text-muted-foreground text-sm">
                {ar.branches.students}: {branch.studentCount} · {ar.branches.admins}: {branch.adminCount}
              </p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge isActive={branch.isActive} />
                <PortalBadge enabled={branch.portalEnabled} />
              </div>
            </div>
            <RowActions branch={branch} onDone={() => router.refresh()} />
          </CardContent>
        </Card>
      )}
    />
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "secondary" : "outline"}>
      {isActive ? ar.common.active : ar.common.inactive}
    </Badge>
  );
}

/** Which branches are in the portal rollout, at a glance — the point of P7 is that
 * this column is mostly مغلقة for a while, on purpose. */
function PortalBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "secondary" : "outline"}>
      {enabled ? ar.branches.portalOn : ar.branches.portalOff}
    </Badge>
  );
}

function RowActions({ branch, onDone }: { branch: BranchWithCounts; onDone: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      {/* Only for a branch already in the rollout: a card is a promise that the URL
          works, and printing one before the switch is on is how a staged rollout turns
          into a morning of phone calls (P7). */}
      {branch.portalEnabled ? (
        <Button asChild variant="ghost" size="icon" aria-label={`${ar.settings.portalCard} ${branch.name}`}>
          <Link href={`/print/portal-card/${branch.id}`} target="_blank">
            <Printer className="size-4" aria-hidden />
          </Link>
        </Button>
      ) : null}

      <BranchFormDialog
        branch={branch}
        trigger={
          <Button variant="ghost" size="icon" aria-label={`${ar.common.edit} ${branch.name}`}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        }
      />

      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${branch.isActive ? ar.branches.deactivate : ar.branches.activate} ${branch.name}`}
          >
            {branch.isActive ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
          </Button>
        }
        title={branch.isActive ? ar.branches.deactivateTitle : ar.branches.activateTitle}
        description={branch.isActive ? ar.branches.deactivateDescription : ar.branches.activateDescription}
        confirmLabel={branch.isActive ? ar.branches.deactivate : ar.branches.activate}
        destructive={branch.isActive}
        successMessage={ar.branches.statusChanged}
        onConfirm={async () => {
          const result = await setBranchActive({ id: branch.id, isActive: !branch.isActive });
          if (result.ok) onDone();
          return result;
        }}
      />
    </div>
  );
}
