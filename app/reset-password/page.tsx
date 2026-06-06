import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "@/app/auth/actions";
import { SubmitButton } from "@/app/auth/SubmitButton";
import { FadeIn } from "@/components/ui/FadeIn";

// Reached via the reset email link (after /auth/callback sets a session).
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // The recovery link must have signed the user in; if not, the link was bad.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <FadeIn className="flex flex-col gap-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold text-foreground">Set a new password</h1>
          <p className="text-sm text-muted-foreground">Choose a password you&apos;ll remember.</p>
        </div>

        {error && (
          <p className="rounded-field bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        )}

        {!user ? (
          <div className="space-y-4 text-center">
            <p className="rounded-field bg-destructive/10 px-4 py-3 text-sm text-destructive">
              This reset link is invalid or has expired.
            </p>
            <Link href="/forgot-password" className="font-medium text-primary underline">
              Request a new link
            </Link>
          </div>
        ) : (
          <form action={updatePassword} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-foreground">
              New password
              <input
                type="password"
                name="password"
                required
                minLength={6}
                autoComplete="new-password"
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
                className="rounded-field border border-input bg-card px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
              />
            </label>
            <SubmitButton>Update password</SubmitButton>
          </form>
        )}
      </FadeIn>
    </main>
  );
}
