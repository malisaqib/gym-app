"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withTimeout } from "@/lib/withTimeout";

/**
 * Wraps an async function with the interaction-feedback essentials so each
 * component doesn't reinvent them:
 *
 *  - `pending`        — true while it runs (drive spinners / disabled states)
 *  - duplicate guard  — ignores a second call while one is in flight, so rapid
 *                       clicks can't double-submit (no duplicate records/requests)
 *  - unmount-safe     — never calls setState after the component unmounts or the
 *                       user navigates away (avoids the "stuck" + React warning)
 *  - timeout path     — optional: rejects a hung request so the UI never spins
 *                       forever without an error
 *  - `error` / `reset`— surfaces a friendly message and lets the UI retry
 *
 * `run` resolves to the function's value on success, or `undefined` on
 * error/timeout (the error is captured in `error`).
 */
export interface AsyncActionOptions {
  /** Reject (and surface an error) if the action runs longer than this. */
  timeoutMs?: number;
  /** Called once on failure (e.g. to show a toast). */
  onError?: (message: string) => void;
}

const GENERIC_ERROR = "Something went wrong. Please try again.";

export function useAsyncAction<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  options: AsyncActionOptions = {}
) {
  const { timeoutMs, onError } = options;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs so the guard/cleanup don't depend on render state.
  const mounted = useRef(true);
  const inFlight = useRef(false);
  // Keep the latest callbacks without forcing `run` to change identity.
  const fnRef = useRef(fn);
  const onErrorRef = useRef(onError);
  fnRef.current = fn;
  onErrorRef.current = onError;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      if (inFlight.current) return undefined; // duplicate-click guard
      inFlight.current = true;
      if (mounted.current) {
        setPending(true);
        setError(null);
      }
      try {
        const call = fnRef.current(...args);
        const result = timeoutMs ? await withTimeout(call, timeoutMs) : await call;
        return result;
      } catch (e) {
        const message = e instanceof Error && e.message ? e.message : GENERIC_ERROR;
        if (mounted.current) setError(message);
        onErrorRef.current?.(message);
        return undefined;
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [timeoutMs]
  );

  const reset = useCallback(() => {
    if (mounted.current) setError(null);
  }, []);

  return { run, pending, error, reset } as const;
}
