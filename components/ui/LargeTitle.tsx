"use client";

import { useEffect, useState } from "react";

/**
 * iOS-style large title. A big, bold title sits inline at the top of the page;
 * as you scroll, a compact, blurred nav bar fades in at the very top showing the
 * same title centered — exactly like Settings/Mail on iPhone.
 *
 * Drop it in as the first child of a <Screen>. It renders its own full-bleed
 * sticky bar (overlay) plus the inline large title.
 */
export function LargeTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* Compact bar — overlays the top once scrolled. */}
      <div
        className={`fixed inset-x-0 top-0 z-30 transition-opacity duration-300 ${
          compact ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="border-b border-border/70 bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex h-12 max-w-md items-center justify-center px-4">
            <span className="truncate font-display text-base font-semibold tracking-tight text-foreground">
              {title}
            </span>
          </div>
        </div>
      </div>

      {/* Inline large title (scrolls away naturally). */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
    </>
  );
}
