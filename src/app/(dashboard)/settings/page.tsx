import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCenterSettings, getTerms, SettingsForm, TermsCard } from "@/modules/settings";
import { hasPermission } from "@/shared/auth/permissions";
import { getSessionUser } from "@/shared/auth/session";
import { ar } from "@/shared/i18n/ar";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: ar.settings.title };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) notFound();

  const [result, terms] = await Promise.all([getCenterSettings(), getTerms()]);
  if (!result.ok) notFound();

  return (
    <>
      <PageHeader title={ar.settings.title} description={ar.settings.description} />
      {result.data ? (
        <div className="grid max-w-3xl gap-6">
          <SettingsForm settings={result.data} />
          {/* The academic calendar (§16 q7): a name on two dates, which the reports
              offer as a preset and the public lookup's "الفصل" figure now means. */}
          {terms.ok ? (
            <TermsCard view={terms.data} canEdit={hasPermission(user.role, "settings.manage")} />
          ) : null}
        </div>
      ) : (
        <EmptyState title={ar.settings.missing} description={ar.settings.missingHint} />
      )}
    </>
  );
}
