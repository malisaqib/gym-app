import { cn } from "@/lib/cn";

// A pulsing placeholder block. Compose these to mirror a screen's real layout
// so loading reads as "almost here", not "frozen".
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
