import { cn } from "@/lib/cn";

// Consistent mobile page container: centered, max phone width, generous spacing,
// and bottom padding so content clears the fixed bottom nav + safe area.
export function Screen({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 pb-28 pt-8",
        className
      )}
    >
      {children}
    </main>
  );
}
