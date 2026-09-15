import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** Every list has one of these — an empty table with no explanation is a dead end. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
      <Inbox className="text-muted-foreground size-8" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
