import { cn } from "@/lib/cn";

/**
 * One consistent spinner for the whole app.
 *
 * - Inherits the current text color (`border-current`) so it sits on any button
 *   or surface without extra props.
 * - Pure CSS (`animate-spin`) — no layout shift, GPU-cheap, and it still spins
 *   under reduced-motion since users expect a busy indicator to keep moving.
 * - Accessible: announces itself with a role + label unless decorative.
 */
type Size = "xs" | "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  xs: "h-3 w-3 border-2",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-2",
  lg: "h-8 w-8 border-[3px]",
};

export function Spinner({
  size = "sm",
  className,
  label = "Loading",
  decorative = false,
}: {
  size?: Size;
  className?: string;
  label?: string;
  decorative?: boolean;
}) {
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent",
        sizes[size],
        className
      )}
    />
  );
}
