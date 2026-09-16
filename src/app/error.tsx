"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";

/**
 * The error boundary (docs/SECURITY-REVIEW.md, finding 6).
 *
 * It shows a generic message and NEVER the exception. A stack trace on screen is a
 * map of the application for whoever is probing it — file paths, package versions,
 * and often the query that failed. The digest is shown because it is the one thing
 * that lets a user tell an administrator which error they saw, and it identifies
 * nothing on its own.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged this with its own redaction; the browser console
    // gets the digest alone.
    console.error("[error-boundary]", error.digest ?? "no digest");
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <TriangleAlert className="size-12 text-amber-600" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight">{ar.errors.unexpectedTitle}</h1>
      {/*
        Two bodies, because only a SERVER error carries a digest. The one text used to
        send everybody looking for "الرقم أدناه" on a screen that, for any client-side
        error, has no number on it (docs/UX-AUDIT-2026-09.md, finding 4).
      */}
      <p className="text-muted-foreground max-w-sm text-sm">
        {error.digest ? ar.errors.unexpectedBody : ar.errors.unexpectedBodyNoDigest}
      </p>

      {error.digest ? (
        <p className="text-muted-foreground font-mono text-xs" dir="ltr">
          {error.digest}
        </p>
      ) : null}

      <Button onClick={reset}>{ar.errors.tryAgain}</Button>
    </main>
  );
}
