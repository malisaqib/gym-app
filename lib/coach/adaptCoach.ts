import type { Lang } from "@/lib/database.types";
import type { GoalDirection } from "@/lib/nutrition/goalPlan";
import type { AdjustmentKind } from "@/lib/nutrition/adapt";

/**
 * SERVER ONLY. The AI's ONLY job here is to PHRASE a plateau nudge warmly — the
 * decision and the adjustment are computed deterministically in lib/nutrition.
 * Returns "" on any problem (no key, timeout, bad response) so the caller can
 * fall back to its own supportive default. Never shames; never says "eat less".
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

function describe(kind: AdjustmentKind): string {
  switch (kind) {
    case "lower_activity":
      return "their body may have adapted, so we can gently recalibrate their daily activity estimate (which slightly lowers the target)";
    case "trim_calories":
      return "we can lower the daily calories by a small, safe amount";
    case "add_calories":
      return "we can add a little more food each day to keep progressing";
  }
}

export async function phrasePlateauNudge(input: {
  direction: GoalDirection;
  kind: AdjustmentKind;
  weeklyRateKg: number;
  lang: Lang;
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "";

  const langName = input.lang === "roman_urdu" ? "Roman Urdu" : "English";
  const system = `You are a kind, encouraging fitness coach. The user's weight has stayed roughly flat for about 2–3 weeks while their goal is to ${
    input.direction === "lose" ? "lose" : "gain"
  } weight. Plateaus are completely normal. The suggested gentle next step is: ${describe(input.kind)}.

Write ONE short, warm sentence (max 25 words) in ${langName} that reassures them this is normal and not their fault, and gently suggests the next step. NEVER shame, NEVER say "eat less", "diet harder", "cheat", or "punish". Output only the sentence, no quotes.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Write the supportive sentence." },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return "";
    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    return (content ?? "").trim().replace(/^["']|["']$/g, "");
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}
