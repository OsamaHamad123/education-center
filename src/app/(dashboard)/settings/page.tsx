import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCenterSettings, SettingsForm } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.settings.title };

export default async function SettingsPage() {
  const result = await getCenterSettings();
  if (!result.ok) notFound();

  return (
    <>
      <PageHeader title={ar.settings.title} description={ar.settings.description} />
      {result.data ? (
        <SettingsForm settings={result.data} />
      ) : (
        <EmptyState title={ar.settings.missing} description={ar.settings.missingHint} />
      )}
    </>
  );
}
