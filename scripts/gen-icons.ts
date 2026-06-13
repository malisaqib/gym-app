/**
 * One-off brand-icon generator. Authors the Zorfit mark (Concept D — a black
 * negative-space "Z" on an emerald squircle) as a single exact SVG, then
 * rasterizes it into every PNG the app references (PWA, Apple touch, OG image)
 * using next/og — so there are no binary blobs to hand-maintain and no new deps.
 *
 * Run: node scripts/gen-icons.ts   (regenerate any time the mark changes)
 *
 * Outputs (public/):
 *   icon-192.png            PWA "any" icon
 *   icon-512.png            PWA "any" icon + OG/Twitter share image
 *   icon-512-maskable.png   PWA "maskable" (full-bleed, safe-zone Z)
 *   apple-touch-icon.png    iOS home-screen (180×180, full-bleed)
 *   icon.svg                crisp browser-tab favicon (rounded tile)
 */
import React from "react";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

// next/og ships as CJS with package "exports"; CJS-resolve it so this works when
// run as a plain ESM script (bare `import "next/og"` fails Node's ESM resolver).
const require = createRequire(import.meta.url);
const { ImageResponse } = require("next/og") as typeof import("next/og");

// Brand colors — kept in lockstep with the `.fitness` theme tokens in globals.css.
const EMERALD_LIGHT = "#45E89A";
const EMERALD_DARK = "#22B97A";
const EMERALD_FLAT = "#2DE28E";
const BLACK = "#000000";

// The mark. `rounded` = iOS squircle tile (favicon / "any"); when false it's a
// full-bleed square for maskable/Apple (the OS applies its own mask). The Z is a
// geometric stroke (no font needed), sized to sit inside the maskable safe zone.
function markSvg(rounded: boolean): string {
  const radius = rounded ? 114 : 0; // 512 * 0.2237 ≈ iOS continuous-corner radius
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${EMERALD_LIGHT}"/>
      <stop offset="1" stop-color="${EMERALD_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#g)"/>
  <path d="M158 172 H354 L158 340 H354" fill="none" stroke="${BLACK}" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

async function writePng(svg: string, size: number, outPath: string): Promise<void> {
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const el = React.createElement(
    "div",
    { style: { display: "flex", width: size, height: size } },
    React.createElement("img", { width: size, height: size, src: dataUri })
  );
  const res = new ImageResponse(el, { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
}

async function main(): Promise<void> {
  const pub = resolve("public");
  mkdirSync(pub, { recursive: true });

  const tile = markSvg(true);
  const full = markSvg(false);

  await writePng(tile, 192, resolve(pub, "icon-192.png"));
  await writePng(tile, 512, resolve(pub, "icon-512.png"));
  await writePng(full, 512, resolve(pub, "icon-512-maskable.png"));
  await writePng(full, 180, resolve(pub, "apple-touch-icon.png"));

  writeFileSync(resolve(pub, "icon.svg"), tile);
  console.log("wrote public/icon.svg");
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
