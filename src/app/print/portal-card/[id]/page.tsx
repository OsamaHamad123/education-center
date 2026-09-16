import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPortalCard, PortalCardSheet } from "@/modules/portal";
import { getCenterIdentity } from "@/modules/settings";
import { ar } from "@/shared/i18n/ar";

export const metadata: Metadata = { title: ar.settings.portalCard };

/**
 * The card the office hands to parents (docs/PARENT-PORTAL-PLAN.md, P7).
 *
 * A branch that is not in the rollout 404s rather than printing: a card is a promise
 * that the URL works, and the whole point of a staged rollout is not to make it early.
 */
export default async function PrintPortalCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [card, identity] = await Promise.all([getPortalCard(id), getCenterIdentity()]);
  // A branch in another tenant's scope returns NOT_FOUND from the query, not FORBIDDEN,
  // and so does this page.
  if (!card.ok || !identity.ok) notFound();

  return (
    <PortalCardSheet
      card={card.data}
      centerName={identity.data.centerName}
      logoPath={identity.data.logoPath}
    />
  );
}
