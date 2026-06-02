import Link from "next/link";
import { signup } from "@/app/auth/actions";

// In Next.js 15, searchParams is a Promise and must be awaited.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground">Takes less than a minute.</p>
      </div>

      {error && (
        <p className="rounded-field bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* The form posts directly to the `signup` Server Action. */}
      <form action={signup} className="flex flex-col gap-4">
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
            minLength={6}
            autoComplete="new-password"
            className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-field bg-primary px-4 py-3 font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[0.98]"
        >
          Sign up
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
