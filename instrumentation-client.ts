import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side Sentry (Next 15.3+ client instrumentation file). Errors only —
 * no tracing, no session replay — so the bundle stays lean and the free quota
 * lasts. Disabled (silent no-op) when NEXT_PUBLIC_SENTRY_DSN is not set.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
});

// Lets Sentry attribute client errors to the route navigation they happened in.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
