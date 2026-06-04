/**
 * Tiny haptics helper. A light, native-feeling tap on key actions.
 *
 * Uses the Web Vibration API, which works on Android/Chrome. iOS Safari ignores
 * it (no API) — harmless, so we never branch on platform. Wrapped in try/catch
 * because some browsers throw when vibration is disabled by the user/OS.
 */
type HapticStrength = "tap" | "soft" | "success";

const PATTERNS: Record<HapticStrength, number | number[]> = {
  tap: 8, // light press (buttons, chips, nav)
  soft: 4, // very subtle (toggles)
  success: [10, 40, 18], // a small "done" buzz (set logged, plan built)
};

export function haptic(strength: HapticStrength = "tap"): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[strength]);
  } catch {
    /* vibration blocked by the OS/user — ignore */
  }
}
