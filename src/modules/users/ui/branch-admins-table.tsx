"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Power, PowerOff } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DataTable } from "@/shared/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import { resetBranchAdminPassword, setBranchAdminActive } from "../application/use-cases/manage-branch-admin";
import type { BranchAdminRow } from "../application/queries/list-branch-admins";

export function BranchAdminsTable({ admins }: { admins: BranchAdminRow[] }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState<{ username: string; password: string } | null>(null);

  const columns: AppColumnDef<BranchAdminRow>[] = [
    { accessorKey: "name", header: ar.users.name },
    {
      accessorKey: "username",
      header: ar.users.username,
      cell: ({ row }) => (
        <span className="font-mono text-xs" dir="ltr">
          {row.original.username}
        </span>
      ),
    },
    { accessorKey: "branchName", header: ar.users.branch },
    {
      accessorKey: "isActive",
      header: ar.users.status,
      cell: ({ row }) => <StatusCell admin={row.original} />,
    },
    {
      id: "createdAt",
      header: ar.users.createdAt,
      cell: ({ row }) => formatDisplayDate(row.original.createdAt.toISOString().slice(0, 10)),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <RowActions admin={row.original} onReset={setNewPassword} onDone={() => router.refresh()} />
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={admins}
        getRowId={(admin) => admin.id}
        searchColumn="name"
        searchPlaceholder={ar.users.name}
        emptyTitle={ar.users.empty}
        renderCard={(admin) => (
          <Card>
            <CardContent className="flex items-start justify-between gap-3 pt-4">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{admin.name}</p>
                <p className="text-muted-foreground font-mono text-xs" dir="ltr">
                  {admin.username}
                </p>
                <p className="text-muted-foreground text-sm">{admin.branchName}</p>
                <StatusCell admin={admin} />
              </div>
              <RowActions admin={admin} onReset={setNewPassword} onDone={() => router.refresh()} />
            </CardContent>
          </Card>
        )}
      />

      {/* Shown once after a reset; the value is not recoverable afterwards. */}
      <Dialog open={newPassword !== null} onOpenChange={() => setNewPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ar.users.temporaryPasswordTitle}</DialogTitle>
            <DialogDescription>{ar.users.temporaryPasswordWarning}</DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-4 text-center">
            <p className="font-mono text-lg select-all" dir="ltr">
              {newPassword?.password}
            </p>
            <p className="text-muted-foreground mt-1 font-mono text-xs" dir="ltr">
              {newPassword?.username}
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewPassword(null)}>{ar.users.done}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusCell({ admin }: { admin: BranchAdminRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={admin.isActive ? "secondary" : "outline"}>
        {admin.isActive ? ar.common.active : ar.common.inactive}
      </Badge>
      {admin.mustChangePassword ? (
        <Badge variant="outline" className="text-xs">
          {ar.users.mustChange}
        </Badge>
      ) : null}
    </div>
  );
}

function RowActions({
  admin,
  onReset,
  onDone,
}: {
  admin: BranchAdminRow;
  onReset: (value: { username: string; password: string }) => void;
  onDone: () => void;
}) {
  const toggleLabel = admin.isActive ? ar.branches.deactivate : ar.branches.activate;

  return (
    <div className="flex shrink-0 gap-1">
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={ar.users.resetPassword + " " + admin.name}>
            <KeyRound className="size-4" aria-hidden />
          </Button>
        }
        title={ar.users.resetTitle}
        description={ar.users.resetDescription}
        confirmLabel={ar.users.resetPassword}
        successMessage={ar.users.passwordReset}
        onConfirm={async () => {
          const result = await resetBranchAdminPassword({ id: admin.id });
          if (result.ok) {
            onReset({ username: result.data.username, password: result.data.temporaryPassword });
            onDone();
          }
          return result;
        }}
      />

      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={toggleLabel + " " + admin.name}>
            {admin.isActive ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
          </Button>
        }
        title={admin.isActive ? ar.users.deactivateTitle : ar.users.activateTitle}
        description={admin.isActive ? ar.users.deactivateDescription : ar.users.activateDescription}
        confirmLabel={toggleLabel}
        destructive={admin.isActive}
        successMessage={ar.users.statusChanged}
        onConfirm={async () => {
          const result = await setBranchAdminActive({ id: admin.id, isActive: !admin.isActive });
          if (result.ok) onDone();
          return result;
        }}
      />
    </div>
  );
}
