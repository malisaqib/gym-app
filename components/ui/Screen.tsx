import { cn } from "@/lib/cn";

// Consistent mobile page container: centered, max phone width, generous spacing,
// bottom padding for the fixed nav + safe area, top padding that clears the notch
// / status bar when installed as a PWA (viewport-fit: cover).
export const SCREEN_SHELL =
  "mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 pb-28 pt-[calc(2rem+env(safe-area-inset-top,0px))]";

export function Screen({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main className={cn(SCREEN_SHELL, className)}>
      {children}
    </main>
  );
}
