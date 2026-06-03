"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

/**
 * A submit button that reads the parent <form>'s pending state via
 * useFormStatus, so it shows a spinner + disables THE MOMENT it's tapped while
 * the server action runs. Fixes the "looks stuck" delay on login/signup.
 */
export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" fullWidth loading={pending}>
      {children}
    </Button>
  );
}
