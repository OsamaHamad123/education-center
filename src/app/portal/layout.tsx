import type { Metadata } from "next";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = {
  title: ar.portal.title,
  // Same as the lookup: a page about one child is not something to index.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The parent portal's shell (docs/PARENT-PORTAL-PLAN.md, P2).
 *
 * No admin chrome, no sidebar, no branch banner — a parent is not a member of staff and
 * the screen should not look like one. Narrow by default, because every one of these
 * will be opened on a phone.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight">{ar.portal.title}</h1>
      {children}
    </main>
  );
}
