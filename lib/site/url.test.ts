import test from "node:test";
import assert from "node:assert/strict";
import { getSiteUrl } from "./url.ts";

test("getSiteUrl prefers NEXT_PUBLIC_SITE_URL", () => {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.zorfit.app/";
  assert.equal(getSiteUrl(), "https://www.zorfit.app");
  process.env.NEXT_PUBLIC_SITE_URL = prev;
});

test("getSiteUrl falls back to localhost when unset", () => {
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  assert.equal(getSiteUrl(), "http://localhost:3000");
  process.env.NEXT_PUBLIC_SITE_URL = prev;
});
