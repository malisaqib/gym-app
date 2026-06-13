import { cn } from "@/lib/cn";
import { BOLT_PATH, BRAND } from "@/lib/brand/mark";

/**
 * The Zorfit mark — emerald lightning-bolt "Z" on true black. Pure SVG so it
 * stays razor-sharp at any size and matches the generated app icons in /public.
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
      <defs>
        <linearGradient id="zorfit-bolt" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={BRAND.emeraldLight} />
          <stop offset="1" stopColor={BRAND.emeraldDark} />
        </linearGradient>
        <filter id="zorfit-edge" x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow
            dx="3"
            dy="2"
            stdDeviation="0.5"
            floodColor={BRAND.amber}
            floodOpacity="0.85"
          />
        </filter>
      </defs>
      <rect width="512" height="512" rx="114" fill={BRAND.black} />
      <path d={BOLT_PATH} fill="url(#zorfit-bolt)" filter="url(#zorfit-edge)" />
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
