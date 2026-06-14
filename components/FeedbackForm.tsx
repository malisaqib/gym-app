"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Lang } from "@/lib/database.types";

/**
 * Feedback / contact card. The user types a message (and optionally their email
 * so we can reply); it's delivered to the app owner's inbox WITHOUT exposing the
 * owner's address anywhere on the page.
 *
 * Delivery uses Web3Forms (https://web3forms.com): a public access key — safe to
 * ship client-side, it can only SEND to the one configured inbox, never read —
 * set as NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY. No backend, no dependency, no secret.
 * If the key isn't configured the form degrades to a clear, non-broken message.
 */

const ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
const MAX = 1500;

const T = {
  tag: { en: "Feedback", roman_urdu: "Feedback" },
  title: { en: "Talk to us", roman_urdu: "Humein bataayein" },
  intro: {
    en: "A bug, an idea, or anything that felt off? Send it — it goes straight to the team and we read every message.",
    roman_urdu: "Koi bug, idea, ya kuch theek nahi laga? Bhejein — seedha team tak jata hai aur hum har message parhte hain.",
  },
  messageLabel: { en: "Your message", roman_urdu: "Aap ka message" },
  messagePlaceholder: {
    en: "What's on your mind?",
    roman_urdu: "Aap kya kehna chahte hain?",
  },
  emailLabel: { en: "Your email (optional, so we can reply)", roman_urdu: "Aap ka email (optional, taake hum jawab dein)" },
  send: { en: "Send feedback", roman_urdu: "Feedback bhejein" },
  sending: { en: "Sending…", roman_urdu: "Bhej rahe hain…" },
  sentTitle: { en: "Thanks — we got it", roman_urdu: "Shukriya — mil gaya" },
  sentBody: {
    en: "Your message is on its way to us. We really appreciate it.",
    roman_urdu: "Aap ka message hum tak pohnch raha hai. Bohat shukriya.",
  },
  errorEmpty: { en: "Write a short message first.", roman_urdu: "Pehle ek chhota message likhein." },
  errorSend: { en: "Couldn't send that. Please try again in a moment.", roman_urdu: "Bhej nahi sake. Thori der baad dobara koshish karein." },
  notConfigured: {
    en: "Feedback isn't switched on yet — please check back soon.",
    roman_urdu: "Feedback abhi on nahi hua — thori der baad dekhein.",
  },
  disclaimer: { en: "This app is a fitness coach, not a medical service.", roman_urdu: "Ye app ek fitness coach hai, medical service nahi." },
} satisfies Record<string, Record<Lang, string>>;

export function FeedbackForm({ lang = "en" }: { lang?: Lang }) {
  const t = (r: Record<Lang, string>) => r[lang];
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = message.trim();
    if (!body) {
      setError(t(T.errorEmpty));
      return;
    }
    if (!ACCESS_KEY) {
      setError(t(T.notConfigured));
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          subject: "Zorfit feedback",
          from_name: "Zorfit feedback",
          // The owner's inbox is configured on the key — never shown here.
          message: body,
          email: email.trim() || undefined, // sender's reply-to, if they gave one
          botcheck: "", // honeypot (kept empty by real users)
        }),
      });
      const data = (await res.json().catch(() => ({ success: false }))) as { success?: boolean };
      if (res.ok && data.success) {
        setStatus("sent");
      } else {
        setStatus("error");
        setError(t(T.errorSend));
      }
    } catch {
      setStatus("error");
      setError(t(T.errorSend));
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
          <span className="sr-only">{t(T.messageLabel)}</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            placeholder={t(T.messagePlaceholder)}
            rows={4}
            className="w-full resize-none rounded-field border border-input bg-background px-3 py-2 text-base text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">{t(T.emailLabel)}</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
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
