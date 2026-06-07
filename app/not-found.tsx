import Link from "next/link";

// Friendly, branded 404 (instead of Next's default). "/" routes signed-in users
// to their dashboard and everyone else to the landing page.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-4xl" aria-hidden>
        🧭
      </span>
      <h1 className="font-display text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">That page doesn&apos;t exist or has moved.</p>
      <Link
        href="/"
        className="rounded-field bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.97]"
      >
        Go home
      </Link>
    </main>
  );
}
