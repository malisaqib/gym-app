"use client";

import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "@/app/auth/actions";
import { Spinner } from "@/components/ui/Spinner";

// The button must read useFormStatus, which only works INSIDE a <form>, so it's
// split from the wrapping form below.
function GoogleSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="inline-flex h-11 w-full select-none touch-manipulation items-center justify-center gap-3 rounded-field border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-soft transition duration-200 ease-ios hover:bg-muted active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
    >
      {pending ? <Spinner size="sm" decorative /> : <GoogleG />}
      {label}
    </button>
  );
}

/**
 * "Continue with Google" — posts to the signInWithGoogle server action, which
 * redirects the browser to Google's consent screen.
 */
export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <form action={signInWithGoogle}>
      <GoogleSubmit label={label} />
    </form>
  );
}

// Official Google "G" mark (multi-colour). Inline SVG so there's no extra asset.
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
