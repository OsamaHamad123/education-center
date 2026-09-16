import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FeePlansScreen, getFeePlans } from "@/modules/fees";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.fees.plans };

/** What each class costs, from when (P5b). The price list is the owner's. */
export default async function FeePlansPage() {
  const user = await getSessionUser();
  if (!user) notFound();

  const view = await getFeePlans();
  if (!view.ok) notFound();

  return (
    <>
      <PageHeader
        title={ar.fees.plans}
        description={ar.fees.plansDescription}
        action={
          <Button asChild variant="outline">
            <Link href="/fees">
              <ArrowRight className="size-4" aria-hidden />
              {ar.fees.title}
            </Link>
          </Button>
        }
      />
      <FeePlansScreen view={view.data} canEdit={hasPermission(user.role, "fee.plan")} />
    </>
  );
}
