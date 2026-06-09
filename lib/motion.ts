import type { Transition, Variants } from "motion/react";

/**
 * Shared motion presets — defined once so the whole app feels like one thing.
 *
 * Apple-like = gentle, quick springs (responsive, barely any overshoot), not
 * floaty or bouncy. Animate transform/opacity only (GPU-friendly).
 */

// Default UI spring: snappy and settled, minimal overshoot.
export const spring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.9,
};

// Softer spring for larger moves (sheets, cards sliding up).
export const springSoft: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

// Gentle, slow fill for the activity rings — eases around the circle and settles
// softly (no snap, a touch of life). Used by ActivityRing / count-ups.
export const springGentle: Transition = {
  type: "spring",
  stiffness: 70,
  damping: 18,
  mass: 1,
};

// Fade + small rise — the house entrance.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: spring },
};

// Stagger wrapper for lists.
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

// A single list row: rises in, scales out on exit (paired with AnimatePresence).
export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

// iOS-style "slide up" for results/sheets.
export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: springSoft },
};
