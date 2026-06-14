import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signup } from "@/app/auth/actions";
import { SubmitButton } from "@/app/auth/SubmitButton";
import { GoogleButton } from "@/app/auth/GoogleButton";
import { FadeIn } from "@/components/ui/FadeIn";
import { LogoMark } from "@/components/brand/Logo";

// In Next.js 15, searchParams is a Promise and must be awaited.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Already signed in? Skip signup.
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
        <h1 className="font-display text-2xl font-semibold text-foreground">Create your account</h1>
        <p className="text-sm text-muted-foreground">Start your fitness journey — it takes less than a minute.</p>
      </div>

      {error && (
        <p className="rounded-field bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Fastest path first: one-tap Google. */}
      <GoogleButton label="Sign up with Google" />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or sign up with email
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* The form posts directly to the `signup` Server Action. */}
      <form action={signup} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
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
            placeholder="At least 6 characters"
            className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
          Confirm password
          <input
            type="password"
            name="confirm"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <SubmitButton>Create account</SubmitButton>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        By creating an account you agree to use Zorfit as a general fitness guide, not medical advice.
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline">
          Log in
        </Link>
      </p>
      </FadeIn>
    </main>
  );
}
