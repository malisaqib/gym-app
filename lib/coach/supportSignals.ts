// Responsible-design helper. Detects free-text that may signal a genuinely
// unhealthy relationship with food or body image. When this is true, the coach
// must respond with a calm, brief nudge toward real support — NOT more diet
// features, stricter targets, or detailed plans. Deliberately conservative
// (clear phrases only) to avoid over-flagging normal beginner worries.
const CONCERN_PATTERNS: RegExp[] = [
  /starv/i,
  /\bnot eating\b|\bbarely eat|hardly eat|stop(ped)? eating/i,
  /skip(ping)? (all )?meals/i,
  /vomit|purg|throw(ing)? up|made myself sick/i,
  /laxativ/i,
  /hate (my|this) body|disgust(ed|ing) (with|by)? ?my/i,
  /punish (myself|my body)/i,
  /(don'?t|do not) deserve (to eat|food)/i,
  /obsess(ed|ing)? (over|with) (food|calories|weight)/i,
];

export function suggestsSupport(text: string | null | undefined): boolean {
  if (!text) return false;
  return CONCERN_PATTERNS.some((re) => re.test(text));
}
