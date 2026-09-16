"use client";

import { ar } from "@/shared/i18n/ar";
import { PrintSheet } from "@/shared/ui/print-sheet";
import type { PortalCard } from "../application/queries/get-portal-card";

/**
 * Four identical cards on one A4 sheet (docs/PARENT-PORTAL-PLAN.md, P7).
 *
 * Four rather than one because the office hands these out at the desk by the handful,
 * and a sheet that yields one card is a sheet nobody prints twice. Dashed borders,
 * because somebody is going to cut them.
 *
 * The card carries the centre's name itself rather than relying on the letterhead: once
 * it is cut out it is on its own, in a bag, on a fridge.
 */
export function PortalCardSheet({
  card,
  centerName,
  logoPath,
}: {
  card: PortalCard;
  centerName: string;
  logoPath: string | null;
}) {
  return (
    <PrintSheet
      orientation="portrait"
      centerName={centerName}
      logoPath={logoPath}
      branchName={card.branchName}
      title={ar.settings.portalCard}
      subtitle={ar.settings.portalCardHint}
    >
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} card={card} centerName={centerName} />
        ))}
      </div>
    </PrintSheet>
  );
}

function Card({ card, centerName }: { card: PortalCard; centerName: string }) {
  return (
    <div className="break-inside-avoid rounded-md border border-dashed p-3 text-[11px] leading-relaxed">
      <p className="text-sm font-bold">{centerName}</p>
      <p className="text-muted-foreground">{card.branchName}</p>

      <p className="mt-2 font-bold">{ar.portalCard.title}</p>
      <p>{ar.portalCard.lead}</p>

      <ol className="mt-2 space-y-1 ps-4" style={{ listStyleType: "arabic-indic" }}>
        <li>
          {ar.portalCard.step1}
          <br />
          {/* Typed off paper, so it is big, LTR, and monospaced — a parent copying
              `l` for `1` is the commonest way a card like this fails. */}
          <span className="font-mono text-[12px] font-bold" dir="ltr">
            {card.portalUrl}
          </span>
        </li>
        <li>{ar.portalCard.step2}</li>
        <li>{ar.portalCard.step3}</li>
      </ol>

      <p className="mt-2">{ar.portalCard.shows}</p>

      <p className="mt-2 font-bold">
        {ar.portalCard.trouble}{" "}
        {card.branchPhone ? (
          <span className="font-mono" dir="ltr">
            {card.branchPhone}
          </span>
        ) : (
          ar.portalCard.noPhone
        )}
      </p>

      <p className="text-muted-foreground mt-1">{ar.portalCard.privacy}</p>
    </div>
  );
}
