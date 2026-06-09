"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Frown } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * App-wide error boundary. Catches unexpected render/server errors in any page
 * and shows a friendly, branded fallback (with a retry) instead of Next's bare
 * default error screen. The real error goes to the console/logs, never the user.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Frown className="h-12 w-12 text-muted-foreground" aria-hidden />
      <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        A hiccup on our end — your data is safe. Please try again.
      </p>
      <div className="flex items-center gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Link
          href="/"
          className="rounded-field border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.97]"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
