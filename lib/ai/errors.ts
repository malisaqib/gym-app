/**
 * User-safe error messages for AI (Groq) failures.
 *
 * Raw provider details (status codes, response bodies, env-var names) must NEVER
 * reach the user — they go to the SERVER logs only. These helpers return Errors
 * with friendly copy that callers can surface directly.
 */

/** Missing API key / not configured — don't reveal env internals. */
export function aiConfigError(): Error {
  return new Error("This is temporarily unavailable. Please try again later.");
}

/**
 * A non-OK HTTP response from the AI provider. Logs the real status/body for
 * debugging, returns a friendly Error (429 → "busy", else generic).
 */
export async function aiHttpError(res: Response, logLabel: string): Promise<Error> {
  const detail = await res.text().catch(() => "");
  // Server-side only.
  console.error(`[ai] ${logLabel} failed: ${res.status} ${detail.slice(0, 300)}`);
  return new Error(
    res.status === 429
      ? "Too many requests right now — please try again in a moment."
      : "Couldn't get a response right now. Please try again."
  );
}
