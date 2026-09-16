"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAction } from "@/shared/ui/use-action";
import { signInToPortal } from "../application/use-cases/portal-session";

/**
 * The portal's front door (docs/PARENT-PORTAL-PLAN.md, P1).
 *
 * The same two fields as the anonymous lookup, because it is the same credential — what
 * this adds is that it is typed once a month rather than once a visit.
 *
 * One message for every failure, deliberately: a wrong code, wrong digits, a child who
 * has left and the feature being switched off all say the same thing, so the form cannot
 * be used to find out which student codes exist.
 */
export function PortalSignIn() {
  const router = useRouter();
  const [isPending, startTransition] = useAction();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await signInToPortal({
        studentCode: readText(data, "studentCode"),
        lastFour: readText(data, "lastFour"),
      });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace("/portal");
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="studentCode">{ar.lookup.studentCode}</Label>
        <Input
          id="studentCode"
          name="studentCode"
          required
          dir="ltr"
          className="text-start"
          placeholder="NSR-26-00001"
          autoComplete="off"
          disabled={isPending}
        />
        <p className="text-muted-foreground text-xs">{ar.lookup.studentCodeHint}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="lastFour">{ar.lookup.lastFour}</Label>
        <Input
          id="lastFour"
          name="lastFour"
          required
          dir="ltr"
          className="text-start"
          inputMode="numeric"
          placeholder="0000"
          autoComplete="off"
          maxLength={4}
          disabled={isPending}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-12 w-full text-base" disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <LogIn className="size-4" aria-hidden />
        )}
        {ar.portal.signIn}
      </Button>
    </form>
  );
}
