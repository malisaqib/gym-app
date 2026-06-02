"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Fixed bottom tab bar for the signed-in app. Active tab gets a soft pill behind
// its icon + the primary colour. Respects the iOS home-indicator safe area.
const TABS = [
  { href: "/dashboard", label: "Home", emoji: "🏠" },
  { href: "/coach", label: "Eat", emoji: "🍽️" },
  { href: "/workout", label: "Train", emoji: "🏋️" },
  { href: "/weight", label: "Weight", emoji: "⚖️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-nav backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex min-h-[44px] flex-1 flex-col items-center gap-1 py-2"
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-pill text-lg transition-colors",
                  active && "bg-primary-soft"
                )}
              >
                {tab.emoji}
              </span>
              <span
                className={cn(
                  "text-[11px]",
                  active ? "font-semibold text-primary" : "text-muted-foreground"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
