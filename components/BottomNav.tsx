"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Utensils, ClipboardList, Dumbbell, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";

// Fixed bottom tab bar for the signed-in app. Active tab gets a soft pill behind
// its icon + the primary colour. Respects the iOS home-indicator safe area.
const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/coach", label: "Eat", icon: Utensils },
  { href: "/diet", label: "Plan", icon: ClipboardList },
  { href: "/workout", label: "Train", icon: Dumbbell },
  { href: "/weight", label: "Progress", icon: TrendingUp },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    // Floating deep-black tab bar — a detached, blurred pill that hovers above the
    // home indicator (the Apple-Fitness feel). Active tab glows emerald.
    <nav className="fixed inset-x-0 bottom-0 z-40 select-none px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.6rem)]">
      <div className="mx-auto flex max-w-md items-stretch justify-around rounded-card-xl border border-border bg-card/80 px-2 py-1.5 shadow-elevated backdrop-blur-xl backdrop-saturate-150">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onPointerDown={() => haptic("tap")}
              className="group flex min-h-[44px] flex-1 flex-col items-center gap-1 rounded-card-lg py-1.5 transition-transform active:scale-[0.92]"
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-pill transition-all duration-200 ease-out",
                  active ? "scale-105 bg-primary/15 shadow-glow-primary" : "scale-100"
                )}
              >
                <tab.icon size={22} className={active ? "text-primary" : "text-muted-foreground"} aria-hidden />
              </span>
              <span
                className={cn(
                  "text-[11px] transition-colors duration-200",
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
