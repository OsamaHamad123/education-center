import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { ar } from "@/shared/i18n/ar";
import { Button } from "@/shared/ui/button";

/**
 * The 404 (docs/SECURITY-REVIEW.md, finding 6).
 *
 * It is also the page a viewer gets for something that exists but is not theirs —
 * a student in another branch, a class they may not see. It therefore says only that
 * the page was not found: distinguishing "does not exist" from "not yours" would turn
 * every URL into a question the app answers honestly.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <FileQuestion className="text-muted-foreground size-12" aria-hidden />
      <h1 className="text-2xl font-bold tracking-tight">{ar.errors.notFoundTitle}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{ar.errors.notFoundBody}</p>
      <Button asChild>
        <Link href="/">{ar.errors.backHome}</Link>
      </Button>
    </main>
  );
}
