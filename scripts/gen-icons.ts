/**
 * Brand-icon generator. Authors the lightning-bolt Z mark as SVG (lib/brand/mark.ts),
 * then rasterizes into every PNG the app references via next/og — no hand-maintained
 * binaries, no extra deps.
 *
 * Run: node scripts/gen-icons.ts
 *
 * Outputs (public/):
 *   icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png, icon.svg
 */
import React from "react";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { brandMarkSvg } from "../lib/brand/mark.ts";

const require = createRequire(import.meta.url);
const { ImageResponse } = require("next/og") as typeof import("next/og");

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

  const tile = brandMarkSvg(true);
  const full = brandMarkSvg(false);

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
