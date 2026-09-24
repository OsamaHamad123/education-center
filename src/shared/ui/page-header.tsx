import type { ReactNode } from "react";

/** Title, optional description, and a slot for the page's primary action. */
export function PageHeader({
  title,
  count,
  description,
  action,
}: {
  title: string;
  /** How many things this page is listing — the first thing anyone asks of a list. */
  count?: number;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="flex items-baseline gap-2 text-2xl font-bold tracking-tight">
          {title}
          {count !== undefined ? (
            <span className="text-muted-foreground text-base font-normal" dir="ltr">
              {count}
            </span>
          ) : null}
        </h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {/*
        NOT `shrink-0`, which it was until 2026-09-24.

        A `shrink-0` container never gets narrower than its content, so an action slot
        holding a `flex-wrap` row could never actually wrap: the row's width stayed at
        max-content and the PAGE scrolled sideways instead. It went unnoticed while
        every page had one or two buttons and was found the day a third was added to
        `/attendance` — on a 375px phone the header ran off the edge and took the
        attendance date stepper with it, which is the one control this product is
        built around.

        `min-w-0` lets it shrink so the wrap inside it can happen. The title keeps its
        own line because the outer container wraps too.
      */}
      {action ? <div className="min-w-0">{action}</div> : null}
    </div>
  );
}
