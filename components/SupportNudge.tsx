import Link from "next/link";
import type { Lang } from "@/lib/database.types";

// Shown when a user's free text suggests a possibly unhealthy relationship with
// food/body. A calm, brief, non-judgmental nudge toward real support — never
// more diet features or stricter targets.
const T = {
  title: { en: "This sounds bigger than fitness", roman_urdu: "Ye fitness se bara lagta hai" },
  body: {
    en: "If stress about food, eating, or your body is weighing on you, that deserves real support — not a stricter plan. Talking to someone helps.",
    roman_urdu:
      "Agar khane, eating, ya apni body ke baare mein stress ho raha hai, to ye asli support deserve karta hai — sakht plan nahi. Kisi se baat karna madad karta hai.",
  },
  cta: { en: "Get support", roman_urdu: "Support lein" },
};

export function SupportNudge({ lang = "en" }: { lang?: Lang }) {
  return (
    <div className="rounded-field border border-primary/30 bg-primary-soft px-4 py-3">
      <p className="text-sm font-semibold text-primary">{T.title[lang]}</p>
      <p className="mt-1 text-sm leading-relaxed text-primary">{T.body[lang]}</p>
      <Link
        href="/settings"
        className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-2"
      >
        {T.cta[lang]} →
      </Link>
    </div>
  );
}
