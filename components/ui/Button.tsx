"use client";

import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 active:bg-primary/95",
  secondary: "border border-border bg-card text-foreground shadow-soft hover:bg-muted hover:border-foreground/15",
  ghost: "text-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
};

// md/lg meet the 44px tap-target minimum; sm (36px) is for compact secondary use.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  className,
  children,
  disabled,
  onPointerDown,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      onPointerDown={(e) => {
        // Light tap on press-down for an instant, native feel (Android; iOS no-ops).
        if (!(disabled || loading)) haptic("tap");
        onPointerDown?.(e);
      }}
      disabled={disabled || loading}
      className={cn(
        // `active:scale` gives an instant pressed feel; touch-manipulation removes
        // the 300ms mobile tap delay. iOS easing makes it react fast, settle soft.
        "inline-flex select-none touch-manipulation items-center justify-center gap-2 rounded-field font-semibold transition duration-200 ease-ios active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
