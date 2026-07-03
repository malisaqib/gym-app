import test from "node:test";
import assert from "node:assert/strict";
import { getPublicSiteUrl, getSiteUrl } from "./url.ts";

const siteEnvKeys = ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_APP_URL", "SITE_URL"] as const;

function withSiteEnv(values: Partial<Record<(typeof siteEnvKeys)[number], string>>, fn: () => void) {
  const prev = new Map<string, string | undefined>();
  for (const key of siteEnvKeys) {
    prev.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of siteEnvKeys) {
      const value = prev.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("getSiteUrl prefers NEXT_PUBLIC_SITE_URL", () => {
  withSiteEnv({ NEXT_PUBLIC_SITE_URL: "https://www.zorfit.app/" }, () => {
    assert.equal(getSiteUrl(), "https://www.zorfit.app");
  });
});

test("getSiteUrl keeps only the origin from configured site URLs", () => {
  withSiteEnv({ NEXT_PUBLIC_SITE_URL: "https://www.zorfit.app/$" }, () => {
    assert.equal(getSiteUrl(), "https://www.zorfit.app");
  });
});

test("getSiteUrl falls back to localhost when unset", () => {
  withSiteEnv({}, () => {
    assert.equal(getSiteUrl(), "http://localhost:3000");
  });
});

test("getPublicSiteUrl falls back to the production domain when unset", () => {
  withSiteEnv({}, () => {
    assert.equal(getPublicSiteUrl(), "https://www.zorfit.app");
  });
});

test("getPublicSiteUrl ignores localhost origins for SEO files", () => {
  withSiteEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }, () => {
    assert.equal(getPublicSiteUrl(), "https://www.zorfit.app");
  });
});
