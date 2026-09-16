"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { signIn } from "@/shared/auth/client";
import { assertNotLockedOut, clearFailedLogins, recordFailedLogin } from "@/shared/auth/login-lockout";
import { ar } from "@/shared/i18n/ar";
import { readText } from "@/shared/lib/form-data";
import { normalizeEgyptianPhone } from "@/shared/lib/phone";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

/**
 * One form, two tabs (PROJECT_PLAN section 9): an admin signs in with a username, a
 * teacher with their phone number and access code. Both hit the same username
 * endpoint — a teacher's username IS their normalized phone — so the tabs are a
 * vocabulary difference for the user, not two authentication paths.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(rawUsername: string, password: string, isTeacher: boolean) {
    setError(null);

    let identifier = rawUsername.trim();
    if (isTeacher) {
      const phone = normalizeEgyptianPhone(identifier);
      if (!phone) {
        setError(ar.auth.invalidCredentials);
        return;
      }
      identifier = phone;
    }

    const username = identifier.toLowerCase();

    startTransition(async () => {
      // Asked BEFORE the password is checked, so a locked account costs an attacker a
      // query and tells them nothing (docs/SECURITY-REVIEW.md, finding 1).
      const gate = await assertNotLockedOut(username);
      if (!gate.ok) {
        setError(gate.error.message);
        return;
      }

      const { error: authError } = await signIn.username({ username, password });

      if (authError) {
        await recordFailedLogin(username);
        // The same message for a wrong name and a wrong password: telling them apart
        // would let someone enumerate valid usernames.
        setError(authError.status === 429 ? ar.auth.tooManyAttempts : ar.auth.invalidCredentials);
        return;
      }

      // Somebody who mistypes twice and then succeeds starts clean.
      await clearFailedLogins(username);

      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    });
  }

  return (
    <Tabs defaultValue="admin" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="admin">{ar.auth.adminTab}</TabsTrigger>
        <TabsTrigger value="teacher">{ar.auth.teacherTab}</TabsTrigger>
      </TabsList>

      <TabsContent value="admin">
        <CredentialsForm
          idLabel={ar.auth.username}
          idName="username"
          idAutoComplete="username"
          secretLabel={ar.auth.password}
          secretType="password"
          isPending={isPending}
          error={error}
          onSubmit={(id, secret) => submit(id, secret, false)}
        />
      </TabsContent>

      <TabsContent value="teacher">
        <CredentialsForm
          idLabel={ar.auth.phone}
          idName="phone"
          idAutoComplete="tel"
          idInputMode="tel"
          idPlaceholder="01xxxxxxxxx"
          secretLabel={ar.auth.accessCode}
          secretType="password"
          secretInputMode="numeric"
          isPending={isPending}
          error={error}
          onSubmit={(id, secret) => submit(id, secret, true)}
        />
      </TabsContent>
    </Tabs>
  );
}

function CredentialsForm(props: {
  idLabel: string;
  idName: string;
  idAutoComplete: string;
  idInputMode?: "tel" | "text";
  idPlaceholder?: string;
  secretLabel: string;
  secretType: "password";
  secretInputMode?: "numeric";
  isPending: boolean;
  error: string | null;
  onSubmit: (identifier: string, secret: string) => void;
}) {
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        props.onSubmit(readText(data, "identifier"), readText(data, "secret"));
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={`${props.idName}-identifier`}>{props.idLabel}</Label>
        <Input
          id={`${props.idName}-identifier`}
          name="identifier"
          required
          dir="ltr"
          className="text-start"
          autoComplete={props.idAutoComplete}
          inputMode={props.idInputMode}
          placeholder={props.idPlaceholder}
          disabled={props.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${props.idName}-secret`}>{props.secretLabel}</Label>
        <Input
          id={`${props.idName}-secret`}
          name="secret"
          type={props.secretType}
          required
          dir="ltr"
          className="text-start"
          autoComplete="current-password"
          inputMode={props.secretInputMode}
          disabled={props.isPending}
        />
      </div>

      {props.error ? (
        <p role="alert" className="text-destructive text-sm">
          {props.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={props.isPending}>
        {props.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {ar.auth.submitting}
          </>
        ) : (
          ar.auth.submit
        )}
      </Button>
    </form>
  );
}
