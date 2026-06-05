"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { phraseProgressNudge } from "./actions";
import type { Lang } from "@/lib/database.types";
import type { GoalDirection } from "@/lib/nutrition/goalPlan";
import type { AdjustmentKind } from "@/lib/nutrition/adapt";

/**
 * A gentle, supportive plateau nudge. The decision + adjustment are computed
 * deterministically on the server (Phase 3); this just shows a warm message and
 * upgrades it with an AI-phrased version when available. Tone: never alarming,
 * never shaming — encouraging and matter-of-fact.
 */

const T = {
  title: { en: "A gentle check-in", roman_urdu: "Ek halka sa check-in" },
  lower_activity: {
    en: "Your weight's held steady for a few weeks — totally normal, bodies adapt. Easing your activity level in Settings can gently get things moving again.",
    roman_urdu:
      "Aap ka wazan kuch hafton se steady hai — bilkul normal, body adjust ho jati hai. Settings mein activity level thoda kam kar ke cheezein dobara chal sakti hain.",
  },
  trim_calories: {
    en: "Things have leveled off for a few weeks — that's normal, not a failure. A small, safe drop in your daily target can help; you can set it in Settings.",
    roman_urdu:
      "Kuch hafton se cheezein ruk gayi hain — ye normal hai, koi nakami nahi. Daily target mein chhoti, mehfooz kami madad kar sakti hai; Settings mein set karein.",
  },
  add_calories: {
    en: "Your weight's been steady for a few weeks — normal when gaining. A little more food each day can help things move; you can adjust it in Settings.",
    roman_urdu:
      "Aap ka wazan kuch hafton se steady hai — gain karte waqt normal. Rozana thora zyada khana madad karega; Settings mein adjust karein.",
  },
} satisfies Record<string, Record<Lang, string>>;

export default function ProgressInsight({
  direction,
  kind,
  weeklyRateKg,
  lang,
}: {
  direction: GoalDirection;
  kind: AdjustmentKind;
  weeklyRateKg: number;
  lang: Lang;
}) {
  const [message, setMessage] = useState<string>(T[kind][lang]);

  // Upgrade the default with an AI-phrased sentence; keep the default on failure.
  useEffect(() => {
    let alive = true;
    phraseProgressNudge({ direction, kind, weeklyRateKg, lang })
      .then((res) => {
        if (alive && res.text) setMessage(res.text);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [direction, kind, weeklyRateKg, lang]);

  return (
    <Card className="space-y-1.5 bg-primary-soft p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
        <span aria-hidden>🌱</span>
        {T.title[lang]}
      </p>
      <p className="text-sm leading-relaxed text-foreground">{message}</p>
    </Card>
  );
}
