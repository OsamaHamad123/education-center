import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Tags } from "lucide-react";
import { FeesBoardView, getFeesBoard } from "@/modules/fees";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.fees.title };

/** Who has paid and who has not, for one month (docs/MESSAGING-AND-FEES-PLAN.md, P5c). */
export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; classId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) notFound();

  const params = await searchParams;
  const board = await getFeesBoard(params);

  const header = (
    <PageHeader
      title={ar.fees.title}
      description={ar.fees.description}
      action={
        hasPermission(user.role, "fee.plan") ? (
          <Button asChild variant="outline">
            <Link href="/fees/plans">
              <Tags className="size-4" aria-hidden />
              {ar.fees.plans}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (!board.ok) {
    // Money is collected at one desk, in one branch, so "كافة الفروع" has no till.
    if (board.error.code === "BRANCH_REQUIRED") {
      return (
        <>
          {header}
          <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.fees.description} />
        </>
      );
    }
    notFound();
  }

  return (
    <>
      {header}
      <FeesBoardView board={board.data} />
    </>
  );
}
