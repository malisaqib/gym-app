/**
 * Tiny app-wide toast bus. No dependency, no provider plumbing through props:
 * any client component calls `toast.success("Saved")` and the single
 * <ToastViewport/> mounted in the root layout renders it.
 *
 * Use sparingly — for meaningful results (saved, updated, failed, timed out),
 * NOT for routine navigation or every tiny interaction.
 */
export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

type Listener = (toast: ToastItem) => void;

const listeners = new Set<Listener>();

function emit(tone: ToastTone, message: string) {
  const item: ToastItem = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    tone,
    message,
  };
  listeners.forEach((l) => l(item));
}

/** Subscribe the viewport; returns an unsubscribe fn. */
export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  info: (message: string) => emit("info", message),
};
