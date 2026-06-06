import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import { SubmitButton } from "@/app/auth/SubmitButton";
import { FadeIn } from "@/components/ui/FadeIn";

// In Next.js 15, searchParams is a Promise and must be awaited.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <FadeIn className="flex flex-col gap-6">
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-semibold text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {message && (
          <p className="rounded-field bg-primary-soft px-4 py-3 text-sm text-primary">{message}</p>
        )}
        {error && (
          <p className="rounded-field bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        )}

        <form action={requestPasswordReset} className="flex flex-col gap-4">
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
          <SubmitButton>Send reset link</SubmitButton>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary underline">
            Back to log in
          </Link>
        </p>
      </FadeIn>
    </main>
  );
}
