import * as Sentry from "@sentry/nextjs";

/**
 * Structured server-side error reporting. Every failure goes two places:
 *   1. Sentry (captureException, tagged with the scope) — alerting + grouping.
 *      A no-op until NEXT_PUBLIC_SENTRY_DSN is configured.
 *   2. The function logs with a stable "[report]" prefix — searchable in the
 *      Vercel dashboard / log drains even with Sentry down or unconfigured.
 */
export function reportError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
    tags: { scope },
    extra: context,
  });
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(
    `[report] ${scope} | ${message}`,
    context ? JSON.stringify(context) : "",
    error instanceof Error && error.stack ? `\n${error.stack}` : ""
  );
}
