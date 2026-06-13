/**
 * Zorfit brand mark — emerald lightning-bolt "Z" on true black (Concept C).
 * Single source of truth for the SVG tile; consumed by Logo.tsx and gen-icons.ts.
 * Colors match the `.fitness` theme tokens in globals.css.
 */

export const BRAND = {
  emerald: "#2DE28E",
  emeraldLight: "#45E89A",
  emeraldDark: "#22B97A",
  amber: "#FBB03B",
  black: "#000000",
} as const;

/** Filled lightning-bolt Z — sharp angles, sized for a 512×512 viewBox. */
export const BOLT_PATH =
  "M178 156 H334 L228 248 H318 L178 356 H334 Z";

/** iOS squircle corner radius at 512px (continuous-corner approximation). */
const TILE_RX = 114;

/**
 * Full SVG document for rasterization (gen-icons) or embedding.
 * @param rounded — squircle tile for "any" icons; square full-bleed for maskable.
 */
export function brandMarkSvg(rounded: boolean): string {
  const rx = rounded ? TILE_RX : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bolt" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${BRAND.emeraldLight}"/>
      <stop offset="1" stop-color="${BRAND.emeraldDark}"/>
    </linearGradient>
    <filter id="edge" x="-8%" y="-8%" width="116%" height="116%">
      <feDropShadow dx="3" dy="2" stdDeviation="0.5" flood-color="${BRAND.amber}" flood-opacity="0.85"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="${BRAND.black}"/>
  <path d="${BOLT_PATH}" fill="url(#bolt)" filter="url(#edge)"/>
</svg>`;
}
