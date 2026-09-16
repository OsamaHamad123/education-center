"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changeOwnPassword } from "@/shared/auth/change-own-password";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

/**
 * One call, not two. The old form changed the password in the browser and then asked
 * a second action to clear `must_change_password` — which could be called on its own
 * (docs/AUDIT-2026-09.md, finding 3). Every rule that matters now lives in
 * `changeOwnPassword`; this component only reports what it says.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      current: readText(data, "current"),
      next: readText(data, "next"),
      confirm: readText(data, "confirm"),
    };

    setError(null);
    startTransition(async () => {
      const result = await changeOwnPassword(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      toast.success(ar.auth.passwordChanged);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <Field name="current" label={ar.auth.currentPassword} disabled={isPending} />
      <Field name="next" label={ar.auth.newPassword} disabled={isPending} autoComplete="new-password" />
      <Field
        name="confirm"
        label={ar.auth.confirmPassword}
        disabled={isPending}
        autoComplete="new-password"
      />

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {ar.common.save}
      </Button>
    </form>
  );
}

function Field(props: { name: string; label: string; disabled: boolean; autoComplete?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input
        id={props.name}
        name={props.name}
        type="password"
        required
        dir="ltr"
        className="text-start"
        autoComplete={props.autoComplete ?? "current-password"}
        disabled={props.disabled}
      />
    </div>
  );
}
