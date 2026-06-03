import type { EmotionalGoalProfile } from "@/app/coach/localCoachTypes";

// Responsible-design helper.
//
// Users pick emotional, sometimes appearance-based reasons ("look good in
// shirts", "wedding"). That's fine as *their* motivation — we never overwrite
// the words they chose. But when we describe what the coach will FOCUS on, we
// translate every goal into neutral, behavior/health-based language:
// consistency, protein, energy, strength, sleep, sustainable routine — never
// body-part or appearance judgments, never good/bad-food framing.
//
// `buildCoachFocus` powers a small "Coach focus" line in the UI today and is the
// safe string we can later pass into the existing coach context (no RAG/AI files
// touched in Phase 2).

const PRESET_FOCUS: Record<string, string> = {
  wedding_event:
    "Showing up feeling your best — steady habits, enough protein, and good energy in the run-up.",
  university_glow_up:
    "Building a routine you can keep: consistent meals, regular movement, and better energy day to day.",
  shirt_look:
    "Feeling comfortable and confident in your clothes through consistent training and balanced eating.",
  confidence:
    "Confidence from consistency — small wins, steady strength, and feeling more energetic.",
  summer_fat_loss:
    "Gradual, sustainable changes: regular meals, enough protein, and movement — not crash dieting.",
  sports_performance:
    "Stamina, strength, and recovery for your sport — fuelling well and training consistently.",
  stop_lazy:
    "More energy and momentum through small, repeatable daily habits.",
  posture:
    "Steady strength work and movement that support better posture and how you feel.",
  build_muscle:
    "Progressive training plus enough protein and food to support steady, sustainable muscle gain.",
};

const GENERIC_FOCUS =
  "Staying consistent, eating enough protein, sleeping well, and building a routine you can keep.";

// Light keyword routing for free-text goals, so custom reasons still get a
// neutral, encouraging focus instead of mirroring appearance wording back.
function focusFromText(text: string): string {
  const t = text.toLowerCase();
  if (/(muscle|bulk|gain|mass|strong|strength)/.test(t)) {
    return "Progressive training plus enough protein and food to support steady, sustainable muscle gain.";
  }
  if (/(stamina|football|cricket|sport|run|cardio|fitness|endurance)/.test(t)) {
    return "Building stamina and energy with consistent training and good fuel.";
  }
  if (/(lazy|tired|energy|motivat|active)/.test(t)) {
    return "More energy and momentum through small, repeatable daily habits.";
  }
  if (/(fat|belly|weight|lean|slim|shirt|wedding|summer|tummy|look)/.test(t)) {
    return "Gradual, sustainable changes — consistent meals, enough protein, and regular movement. We focus on habits and energy, not the scale alone.";
  }
  return GENERIC_FOCUS;
}

// Returns a short, neutral focus line for the chosen goal. Preset wins; otherwise
// we route the custom text. Always behavior/health-based, never appearance.
export function buildCoachFocus(goal: EmotionalGoalProfile): string {
  const preset = PRESET_FOCUS[goal.selectedPreset];
  if (preset) return preset;
  const custom = goal.customGoal.trim();
  if (custom) return focusFromText(custom);
  return GENERIC_FOCUS;
}
