"use client";

import { useFormStatus } from "react-dom";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/Button";

/**
 * Sign-out as a form posting to the `signOut` server action. useFormStatus gives
 * us a pending spinner the instant it's tapped (the action ends in a redirect,
 * so the button stays in its loading state right up until navigation) — no more
 * "did my tap register?" doubt, and it can't be double-submitted.
 */
function PendingButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" fullWidth loading={pending}>
      {pending ? "Signing out…" : children}
    </Button>
  );
}

export function SignOutButton({ children = "Sign out" }: { children?: React.ReactNode }) {
  return (
    <form action={signOut}>
      <PendingButton>{children}</PendingButton>
    </form>
  );
}

/** Compact ghost variant for the dashboard header. */
export function SignOutGhostButton() {
  return (
    <form action={signOut}>
      <CompactPending />
    </form>
  );
}

function CompactPending() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" loading={pending}>
      {pending ? "…" : "Sign out"}
    </Button>
  );
}
