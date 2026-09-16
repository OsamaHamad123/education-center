import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContactDate, ContactListView, getContactList } from "@/modules/reports";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.contact.title };

/**
 * Who to ring today (docs/MESSAGING-AND-FEES-PLAN.md, P4b).
 *
 * Under `/attendance` rather than `/reports` deliberately: this is not something you read
 * at the end of the month, it is the last thing the office does before going home.
 */
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const list = await getContactList({ date });

  const header = (
    <PageHeader
      title={ar.contact.title}
      description={ar.contact.description}
      action={
        <Button asChild variant="outline">
          <Link href="/attendance">
            <ArrowRight className="size-4" aria-hidden />
            {ar.attendance.title}
          </Link>
        </Button>
      }
    />
  );

  // "كافة الفروع" has nobody to ring: the families belong to a branch's own morning.
  if (!list.ok) {
    if (list.error.code === "BRANCH_REQUIRED") {
      return (
        <>
          {header}
          <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.contact.description} />
        </>
      );
    }
    notFound();
  }

  return (
    <>
      {header}
      <ContactDate date={list.data.date} />
      <ContactListView list={list.data} />
    </>
  );
}
