import { cn } from "@/lib/cn";

/**
 * The Zorfit mark — a black negative-space "Z" on an emerald squircle. Pure SVG
 * so it stays razor-sharp at any size and always matches the brand color exactly
 * (kept in lockstep with the generated app icons in /public). The Z is a
 * geometric stroke, not text, so it needs no font.
 */
export function LogoMark({
  size = 32,
  className,
  title = "Zorfit",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label={title}
    >
      <rect width="512" height="512" rx="114" fill="#2DE28E" />
      <path
        d="M158 172 H354 L158 340 H354"
        fill="none"
        stroke="#000000"
        strokeWidth="52"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Horizontal lockup: the mark + the "Zorfit" wordmark, for page headers. */
export function Wordmark({
  className,
  markSize = 34,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={markSize} title="" />
      <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Zorfit
      </span>
    </div>
  );
}
