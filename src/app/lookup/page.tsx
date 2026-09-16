import type { Metadata } from "next";
import Image from "next/image";
import { LookupForm } from "@/modules/lookup";
import { getPublicCenterInfo } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";
import { EmptyState } from "@/shared/ui/empty-state";

export const metadata: Metadata = {
  title: ar.lookup.title,
  // The root layout already sets this; repeated here because this is the ONE page a
  // search engine can reach, and it must not inherit its way out of noindex.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The public parent/student lookup (PROJECT_PLAN 10.8).
 *
 * `force-dynamic` because nothing about this page may be cached: the shell holds no
 * student data, but a cached response for the one route an attacker can reach is one
 * more thing whose behaviour has to be reasoned about.
 *
 * The result never appears in a URL — see `LookupForm`.
 */
export const dynamic = "force-dynamic";

export default async function LookupPage() {
  const centre = await getPublicCenterInfo();

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <header className="space-y-2 text-center">
        {centre.logoPath ? (
          <Image
            src={centre.logoPath}
            alt=""
            width={64}
            height={64}
            className="mx-auto size-16 object-contain"
          />
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight">{centre.centerName || ar.app.name}</h1>
        <p className="text-muted-foreground text-sm">{ar.lookup.description}</p>
      </header>

      {/* Turning the feature off closes the page as well as the data path: the SQL
          function refuses regardless, but a form that cannot work should not be
          offered. */}
      {centre.lookupEnabled ? (
        <LookupForm />
      ) : (
        <EmptyState title={ar.lookup.disabled} description={ar.lookup.description} />
      )}
    </main>
  );
}
