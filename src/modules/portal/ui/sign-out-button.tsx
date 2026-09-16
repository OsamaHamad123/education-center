"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
// Straight to the action file, not through the module index: the index also exports
// server queries that import the database client, and a client component that reaches
// for the barrel drags `postgres` into the browser bundle. The build says so loudly.
import { signOutOfPortal } from "../application/use-cases/portal-session";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";
import { useAction } from "@/shared/ui/use-action";

/** Ends the session on the SERVER as well as dropping the cookie. */
export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useAction();

  return (
    <Button
      variant="ghost"
      className="w-full"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await signOutOfPortal();
          router.replace("/portal");
          router.refresh();
        })
      }
    >
      <LogOut className="size-4" aria-hidden />
      {ar.portal.signOut}
    </Button>
  );
}
