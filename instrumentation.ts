import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry (Next.js instrumentation hook — loaded natively by
 * Next 15.3+, no build-config wrapper needed).
 *
 * Errors-only configuration: tracing is off so the free quota goes entirely to
 * exceptions. With no NEXT_PUBLIC_SENTRY_DSN set, the SDK is disabled and
 * everything is a silent no-op — the app never depends on Sentry being up.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0,
    });
  }
}

// Captures errors from nested React Server Components / route handlers.
export const onRequestError = Sentry.captureRequestError;
