"use server";

import { createClient } from "@/lib/supabase/server";
import { consumeUsage } from "@/lib/usage";
import { reportError } from "@/lib/log";

/**
 * Email a user's feedback to the owner via Resend (the same provider used for
 * Supabase SMTP). SERVER-ONLY: the Resend key is a secret (never NEXT_PUBLIC),
 * the destination inbox lives in an env var (kept out of the repo), and the
 * owner's address is never exposed to the client. Reply-to is set to the
 * signed-in user's email so a reply goes straight back to them.
 */

const FROM = "Zorfit Feedback <feedback@zorfit.app>"; // must be on the Resend-verified domain
const MAX = 1500;

export async function sendFeedback(message: string): Promise<{ ok: boolean; error?: string }> {
  const body = (message ?? "").trim().slice(0, MAX);
  if (!body) return { ok: false, error: "Write a short message first." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to send feedback." };

  // Anti-spam: cap feedback per user per day (reuses the existing limiter).
  const { allowed } = await consumeUsage(supabase, "feedback");
  if (!allowed) return { ok: false, error: "You've sent a lot today — please try again tomorrow." };

  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (!key || !to) {
    reportError("sendFeedback.config", new Error("RESEND_API_KEY or FEEDBACK_TO_EMAIL not set"));
    return { ok: false, error: "Feedback isn't switched on yet — please check back soon." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: user.email ?? undefined,
        subject: "Zorfit feedback",
        text: `From: ${user.email ?? "unknown"} (user ${user.id})\n\n${body}`,
      }),
    });
    if (!res.ok) {
      reportError("sendFeedback.resend", new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`));
      return { ok: false, error: "Couldn't send that. Please try again in a moment." };
    }
    return { ok: true };
  } catch (e) {
    reportError("sendFeedback", e);
    return { ok: false, error: "Couldn't send that. Please try again in a moment." };
  }
}
