import { ar } from "@/shared/i18n/ar";

/** Centred, chrome-free shell for the login and forced-password-change screens. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{ar.app.name}</h1>
          <p className="text-muted-foreground text-sm">{ar.auth.loginSubtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
