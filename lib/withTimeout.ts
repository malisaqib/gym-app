/**
 * Reject a promise if it hasn't settled within `ms`, so the UI never shows an
 * infinite spinner when a network/AI request hangs. The underlying request
 * isn't aborted (Supabase/fetch handle their own sockets) — we simply stop
 * waiting and surface a friendly, retryable error.
 */
export const TIMEOUT_MESSAGE =
  "This is taking too long. Please check your connection and try again.";

export function withTimeout<T>(promise: Promise<T>, ms: number, message = TIMEOUT_MESSAGE): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
