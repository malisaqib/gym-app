/**
 * Minimal structured server-side error reporting. Vercel captures function
 * console output, so the stable "[report]" prefix + scope make real failures
 * searchable in the dashboard / log drains instead of vanishing into generic
 * { ok: false } strings.
 *
 * When a monitoring service (e.g. Sentry) is approved, swap ONLY this body for
 * captureException — no call site changes.
 */
export function reportError(scope: string, error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(
    `[report] ${scope} | ${message}`,
    context ? JSON.stringify(context) : "",
    error instanceof Error && error.stack ? `\n${error.stack}` : ""
  );
}
