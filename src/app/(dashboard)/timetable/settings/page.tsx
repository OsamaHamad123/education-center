import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getScheduleSettings, ScheduleSettingsForm } from "@/modules/timetable";
import { resolveTenantContext } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.timetable.settingsTitle };

export default async function ScheduleSettingsPage() {
  const ctx = await resolveTenantContext();
  if (!ctx) notFound();

  const header = (
    <PageHeader
      title={ar.timetable.settingsTitle}
      description={ar.timetable.settingsDescription}
      action={
        <Button asChild variant="outline">
          <Link href="/timetable">
            <ArrowRight className="size-4" aria-hidden />
            {ar.timetable.title}
          </Link>
        </Button>
      }
    />
  );

  // The bell schedule belongs to ONE branch, so there is nothing to edit centrally.
  if (ctx.branchId === null) {
    return (
      <>
        {header}
        <EmptyState title={ar.banners.allBranchesReadOnly} description={ar.timetable.settingsDescription} />
      </>
    );
  }

  const schedules = await getScheduleSettings();
  if (!schedules.ok) notFound();

  return (
    <>
      {header}
      <ScheduleSettingsForm schedules={schedules.data} />
    </>
  );
}
