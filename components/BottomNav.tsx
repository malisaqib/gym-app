"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Fixed bottom tab bar for the signed-in app — the standard mobile pattern.
// Respects the iOS home-indicator safe area.
const TABS = [
  { href: "/dashboard", label: "Home", emoji: "🏠" },
  { href: "/coach", label: "Eat", emoji: "🍽️" },
  { href: "/workout", label: "Train", emoji: "🏋️" },
  { href: "/weight", label: "Weight", emoji: "⚖️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                active ? "text-emerald-600" : "text-slate-400"
              }`}
            >
              <span className="text-lg leading-none">{tab.emoji}</span>
              <span className={active ? "font-semibold" : ""}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
