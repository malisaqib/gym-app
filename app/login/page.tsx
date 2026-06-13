import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { login, resendConfirmation } from "@/app/auth/actions";
import { SubmitButton } from "@/app/auth/SubmitButton";
import { FadeIn } from "@/components/ui/FadeIn";
import { LogoMark } from "@/components/brand/Logo";

// In Next.js 15, searchParams is a Promise and must be awaited.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; unconfirmed?: string }>;
}) {
  const { error, message, unconfirmed } = await searchParams;

  // Already signed in? Send them to the app instead of showing the login form.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <FadeIn className="flex flex-col gap-6">
      <div className="space-y-1 text-center">
        <LogoMark size={56} className="mx-auto mb-2 rounded-[22%] shadow-soft" title="Zorfit logo" />
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

      {/* Recovery path for an unconfirmed email: one tap to resend the link. */}
      {unconfirmed && (
        <form action={resendConfirmation} className="flex flex-col gap-2">
          <input type="hidden" name="email" value={unconfirmed} />
          <button
            type="submit"
            className="rounded-field border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition hover:bg-muted active:scale-[0.99]"
          >
            Resend confirmation email
          </button>
        </form>
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
            defaultValue={unconfirmed ?? ""}
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
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton>Log in</SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="font-medium text-primary underline">
          Sign up
        </Link>
      </p>
      </FadeIn>
    </main>
  );
}
