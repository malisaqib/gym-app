// Tiny className joiner (no dependency). Filters out falsy values so you can do
// cn("base", condition && "extra", className).
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
