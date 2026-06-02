import Link from "next/link";
import { login } from "@/app/auth/actions";

// In Next.js 15, searchParams is a Promise and must be awaited.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Log in</h1>
        <p className="text-sm text-muted-foreground">Welcome back.</p>
      </div>

      {/* Success/info message (e.g. after signing up) */}
      {message && (
        <p className="rounded-field bg-primary-soft px-4 py-3 text-sm text-primary">
          {message}
        </p>
      )}
      {/* Error message from a failed login attempt */}
      {error && (
        <p className="rounded-field bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* The form posts directly to the `login` Server Action. */}
      <form action={login} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-field bg-primary px-4 py-3 font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
        >
          Log in
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="font-medium text-primary underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
