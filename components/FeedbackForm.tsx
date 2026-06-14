"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { sendFeedback } from "@/app/settings/feedbackActions";
import type { Lang } from "@/lib/database.types";

/**
 * Feedback / contact card (Settings). The user types a message; it's emailed to
 * the owner's inbox via Resend (server action) WITHOUT exposing the owner's
 * address anywhere. The sender is the signed-in account, so a reply goes back to
 * them automatically — no need to ask for their email.
 */

const MAX = 1500;

const T = {
  tag: { en: "Feedback", roman_urdu: "Feedback" },
  title: { en: "Talk to us", roman_urdu: "Humein bataayein" },
  intro: {
    en: "A bug, an idea, or anything that felt off? Send it — it comes straight to us and we read every message.",
    roman_urdu: "Koi bug, idea, ya kuch theek nahi laga? Bhejein — seedha hum tak aata hai aur hum har message parhte hain.",
  },
  placeholder: { en: "What's on your mind?", roman_urdu: "Aap kya kehna chahte hain?" },
  send: { en: "Send feedback", roman_urdu: "Feedback bhejein" },
  sending: { en: "Sending…", roman_urdu: "Bhej rahe hain…" },
  sentTitle: { en: "Thanks — we got it", roman_urdu: "Shukriya — mil gaya" },
  sentBody: {
    en: "Your message is on its way to us. We really appreciate it.",
    roman_urdu: "Aap ka message hum tak pohnch raha hai. Bohat shukriya.",
  },
  disclaimer: { en: "This app is a fitness coach, not a medical service.", roman_urdu: "Ye app ek fitness coach hai, medical service nahi." },
} satisfies Record<string, Record<Lang, string>>;

export function FeedbackForm({ lang = "en" }: { lang?: Lang }) {
  const t = (r: Record<Lang, string>) => r[lang];
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = message.trim();
    if (!body || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await sendFeedback(body);
      if (res.ok) setStatus("sent");
      else {
        setStatus("idle");
        setError(res.error ?? "Couldn't send that. Please try again.");
      }
    } catch {
      setStatus("idle");
      setError("Couldn't send that. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <Card className="space-y-2 p-5">
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle2 size={20} aria-hidden />
          <h2 className="font-display text-lg font-semibold text-foreground">{t(T.sentTitle)}</h2>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(T.sentBody)}</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t(T.tag)}</p>
        <h2 className="font-display text-lg font-semibold text-foreground">{t(T.title)}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t(T.intro)}</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="sr-only">{t(T.title)}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            placeholder={t(T.placeholder)}
            rows={4}
            className="w-full resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" fullWidth loading={status === "sending"} disabled={!message.trim()}>
          {status !== "sending" && <Send size={16} aria-hidden />}
          {status === "sending" ? t(T.sending) : t(T.send)}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">{t(T.disclaimer)}</p>
    </Card>
  );
}
