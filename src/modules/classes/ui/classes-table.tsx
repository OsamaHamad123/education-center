"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Power, PowerOff, Users } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DataTable } from "@/shared/ui/data-table";
import type { AppColumnDef } from "@/shared/ui/table-hook";
import { setClassActive } from "../application/use-cases/manage-class";
import type { ClassWithCounts } from "../application/queries/list-classes";
import { ClassFormDialog } from "./class-form";

export function ClassesTable({ classes }: { classes: ClassWithCounts[] }) {
  const router = useRouter();

  const columns: AppColumnDef<ClassWithCounts>[] = [
    { accessorKey: "name", header: ar.classes.name },
    {
      accessorKey: "track",
      header: ar.classes.track,
      cell: ({ row }) => ar.tracks[row.original.track],
    },
    {
      accessorKey: "gender",
      header: ar.classes.gender,
      cell: ({ row }) => ar.classes.genders[row.original.gender],
    },
    { accessorKey: "gradeLevel", header: ar.classes.gradeLevel },
    { accessorKey: "studentCount", header: ar.classes.students },
    { accessorKey: "sessionCount", header: ar.classes.sessions },
    {
      accessorKey: "isActive",
      header: ar.branches.status,
      cell: ({ row }) => <StatusBadge isActive={row.original.isActive} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <RowActions klass={row.original} onDone={() => router.refresh()} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={classes}
      getRowId={(klass) => klass.id}
      searchColumn="name"
      searchPlaceholder={ar.classes.name}
      emptyTitle={ar.classes.empty}
      emptyDescription={ar.classes.emptyHint}
      renderCard={(klass) => (
        <Card>
          <CardContent className="flex items-start justify-between gap-3 pt-4">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{klass.name}</p>
              <p className="text-muted-foreground text-sm">
                {ar.tracks[klass.track]} · {ar.classes.genders[klass.gender]} · {klass.gradeLevel}
              </p>
              <p className="text-muted-foreground text-sm">
                {ar.classes.students}: {klass.studentCount} · {ar.classes.sessions}: {klass.sessionCount}
              </p>
              <StatusBadge isActive={klass.isActive} />
            </div>
            <RowActions klass={klass} onDone={() => router.refresh()} />
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

function RowActions({ klass, onDone }: { klass: ClassWithCounts; onDone: () => void }) {
  const toggleLabel = klass.isActive ? ar.branches.deactivate : ar.branches.activate;

  return (
    <div className="flex shrink-0 gap-1">
      <Button variant="ghost" size="icon" asChild aria-label={ar.classes.students + " " + klass.name}>
        <Link href={`/students?classId=${klass.id}`}>
          <Users className="size-4" aria-hidden />
        </Link>
      </Button>

      <ClassFormDialog
        klass={klass}
        trigger={
          <Button variant="ghost" size="icon" aria-label={ar.common.edit + " " + klass.name}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        }
      />

      <ConfirmDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label={toggleLabel + " " + klass.name}>
            {klass.isActive ? (
              <PowerOff className="size-4" aria-hidden />
            ) : (
              <Power className="size-4" aria-hidden />
            )}
          </Button>
        }
        title={klass.isActive ? ar.classes.deactivateTitle : ar.classes.activateTitle}
        description={klass.isActive ? ar.classes.deactivateDescription : ar.classes.activateDescription}
        confirmLabel={toggleLabel}
        destructive={klass.isActive}
        successMessage={ar.classes.statusChanged}
        onConfirm={async () => {
          const result = await setClassActive({ id: klass.id, isActive: !klass.isActive });
          if (result.ok) onDone();
          return result;
        }}
      />
    </div>
  );
}
