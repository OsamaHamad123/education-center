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
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
