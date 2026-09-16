"use client";

import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { ALL_BRANCHES } from "@/shared/config/constants";
import { ar } from "@/shared/i18n/ar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { selectBranch } from "../application/use-cases/select-branch";
import type { BranchOption } from "../application/queries/list-branches";
import { useAction } from "@/shared/ui/use-action";

/**
 * Visible only to a super admin (PROJECT_PLAN section 9). A branch admin never
 * receives this component at all — the layout does not render it for them — so there
 * is no disabled control hinting that other branches exist.
 */
export function BranchSwitcher({
  branches,
  selectedBranchId,
}: {
  branches: BranchOption[];
  selectedBranchId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useAction();

  function onChange(value: string) {
    startTransition(async () => {
      const result = await selectBranch({ branchId: value });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Select value={selectedBranchId ?? ALL_BRANCHES} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="w-full sm:w-56" aria-label={ar.nav.switchBranch}>
        <Building2 className="size-4 shrink-0" aria-hidden />
        <SelectValue placeholder={ar.nav.allBranches} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_BRANCHES}>{ar.nav.allBranches}</SelectItem>
        {branches.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
