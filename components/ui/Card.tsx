import { cn } from "@/lib/cn";

// Surface container. Padding is left to the caller so cards stay flexible.
// `interactive` makes it feel tappable: a gentle lift on hover and a soft
// press on tap — for cards that act as buttons/links.
export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card text-card-foreground shadow-soft",
        interactive &&
          "cursor-pointer touch-manipulation select-none transition duration-200 ease-ios hover:-translate-y-0.5 hover:shadow-pop active:translate-y-0 active:scale-[0.99] active:shadow-soft",
        className
      )}
      {...props}
    />
  );
}
