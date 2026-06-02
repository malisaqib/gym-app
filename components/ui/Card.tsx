import { cn } from "@/lib/cn";

// Surface container. Padding is left to the caller so cards stay flexible.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card text-card-foreground shadow-soft",
        className
      )}
      {...props}
    />
  );
}
