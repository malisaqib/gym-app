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
  // Drop benign, user-recoverable noise so the free quota goes to real bugs:
  //  - "unexpected response from the server": a Next.js Server Action call from a
  //    STALE client bundle after we redeploy (action IDs change each deploy). The
  //    user just needs a refresh; it isn't a code bug.
  //  - network/abort/load errors: flaky mobile connections, not our crashes.
  ignoreErrors: [
    "An unexpected response was received from the server",
    "Failed to fetch",
    "NetworkError",
    "Load failed",
    "AbortError",
    "The operation was aborted",
  ],
});

// Lets Sentry attribute client errors to the route navigation they happened in.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
