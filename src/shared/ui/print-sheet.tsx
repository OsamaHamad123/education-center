"use client";

import Image from "next/image";
import { ar } from "@/shared/i18n/ar";
import { formatDisplayDate } from "@/shared/lib/time";
import { Button } from "@/shared/ui/button";

/**
 * The chrome around every `/print/*` page (PROJECT_PLAN section 12).
 *
 * Two rules shape this component. The page must be laid out for PAPER, not for a
 * viewport — so the container is a fixed A4 width and the `@page` size comes from the
 * caller. And everything that only makes sense on screen (the print button, the back
 * link) is marked `print:hidden`, because a sheet handed to a parent must not have a
 * button printed on it.
 */
export function PrintSheet({
  orientation,
  centerName,
  logoPath,
  branchName,
  title,
  subtitle,
  children,
  signature,
}: {
  orientation: "portrait" | "landscape";
  centerName: string;
  logoPath: string | null;
  branchName: string | null;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Payroll and attendance sheets are signed; a timetable is not. */
  signature?: boolean;
}) {
  return (
    <>
      {/* Set per page: a timetable is landscape, an attendance sheet is portrait. */}
      <style>{`@page { size: A4 ${orientation}; margin: 12mm; }`}</style>

      <div className="mx-auto max-w-[277mm] p-4 print:max-w-none print:p-0">
        <div className="mb-4 flex items-center gap-2 print:hidden">
          <Button onClick={() => window.print()}>{ar.common.print}</Button>
          <Button variant="outline" onClick={() => window.close()}>
            {ar.print.backToApp}
          </Button>
        </div>

        <header className="mb-4 flex items-start gap-3 border-b pb-3">
          {logoPath ? (
            <Image src={logoPath} alt="" width={48} height={48} className="size-12 object-contain" />
          ) : null}

          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{centerName}</p>
            {branchName ? <p className="text-sm">{branchName}</p> : null}
          </div>

          <div className="text-end text-sm">
            <p className="font-medium">{title}</p>
            {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
            <p className="text-muted-foreground text-xs">
              {ar.print.printedAt}: {formatDisplayDate(todayForPrint())}
            </p>
          </div>
        </header>

        <main>{children}</main>

        {signature ? (
          <footer className="mt-8 flex justify-between text-sm">
            <span>{ar.print.signature}: ____________________</span>
            <span>{ar.print.signature}: ____________________</span>
          </footer>
        ) : null}
      </div>
    </>
  );
}

/**
 * The print date is genuinely "now on this device", so it is read in the browser —
 * rendering it on the server would freeze the date into the cached page.
 */
function todayForPrint(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
