"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { submitFoodReport } from "@/app/reports/actions";
import type { Lang, ReportContext, ReportType } from "@/lib/database.types";

/**
 * Shared "report missing / incorrect food" form (Phase 2).
 *
 * A small bottom-sheet, NOT a page. Bilingual. Pre-fills the reported text and
 * sets the report type from wherever it was opened, then collects an optional
 * note + optional rough calories/protein. Submitting writes a real row via the
 * server action; success/error/loading are all surfaced (a report is never
 * silently dropped). This component does NOT block logging — callers open it
 * alongside / after their normal log/add flow.
 */

const T = {
  titleMissing: { en: "Tell us what's missing", roman_urdu: "Bataayein kya missing hai" },
  titleIncorrect: { en: "Report incorrect food", roman_urdu: "Ghalat food report karein" },
  introMissing: {
    en: "Couldn't find it? Tell us and we'll add it to our food list.",
    roman_urdu: "Nahi mila? Bataayein, hum is ko apni food list mein add kar dein ge.",
  },
  introIncorrect: {
    en: "Something off with this food's numbers or name? Let us know and we'll fix it.",
    roman_urdu: "Is food ke numbers ya naam mein kuch ghalat hai? Bataayein, hum theek kar dein ge.",
  },
  foodLabel: { en: "Food", roman_urdu: "Food" },
  foodPlaceholder: { en: "e.g. chapli kebab", roman_urdu: "misal: chapli kabab" },
  noteLabel: { en: "Anything that helps us add it? (optional)", roman_urdu: "Kuch jo madad kare? (optional)" },
  notePlaceholder: {
    en: "e.g. brand, usual portion, how it's made",
    roman_urdu: "misal: brand, aam portion, kaise banta hai",
  },
  estLabel: { en: "Rough numbers (optional)", roman_urdu: "Andazan numbers (optional)" },
  estHint: {
    en: "If you have a rough idea, it helps — totally optional.",
    roman_urdu: "Agar motatay andaza ho to madad karta hai — bilkul optional.",
  },
  calories: { en: "Calories", roman_urdu: "Calories" },
  protein: { en: "Protein (g)", roman_urdu: "Protein (g)" },
  submit: { en: "Send report", roman_urdu: "Report bhejein" },
  sending: { en: "Sending…", roman_urdu: "Bhej rahe hain…" },
  cancel: { en: "Cancel", roman_urdu: "Cancel" },
  successTitle: { en: "Thanks — report sent", roman_urdu: "Shukriya — report mil gayi" },
  successBody: {
    en: "We'll review it and add or fix this food. You can keep logging as usual.",
    roman_urdu: "Hum review kar ke is food ko add ya theek kar dein ge. Aap aam tarah log karte rahein.",
  },
  toastSuccess: { en: "Report sent — thank you!", roman_urdu: "Report bhej di — shukriya!" },
  emptyError: { en: "Tell us which food, first.", roman_urdu: "Pehle bataayein kaunsa food." },
  genericError: {
    en: "Couldn't send that report. Please try again.",
    roman_urdu: "Report nahi bhej sake. Dobara koshish karein.",
  },
} satisfies Record<string, Record<Lang, string>>;

export default function ReportFoodSheet({
  open,
  onClose,
  reportType,
  context,
  reportedText,
  matchedFoodId = null,
  lang = "en",
}: {
  open: boolean;
  onClose: () => void;
  reportType: ReportType;
  context: ReportContext;
  /** Pre-filled food text (editable so the user can refine it). */
  reportedText: string;
  /** Optional id of the existing food being corrected (incorrect reports). */
  matchedFoodId?: string | null;
  lang?: Lang;
}) {
  const t = (k: keyof typeof T) => T[k][lang];

  const [text, setText] = useState(reportedText);
  const [note, setNote] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the sheet opens (or the pre-filled food changes),
  // so a previous report's text/state never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setText(reportedText);
    setNote("");
    setCalories("");
    setProtein("");
    setSubmitting(false);
    setDone(false);
    setError(null);
  }, [open, reportedText]);

  // After a success, briefly show the confirmation, then close.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(onClose, 1400);
    return () => clearTimeout(id);
  }, [done, onClose]);

  const title = reportType === "missing" ? t("titleMissing") : t("titleIncorrect");
  const intro = reportType === "missing" ? t("introMissing") : t("introIncorrect");

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError(t("emptyError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitFoodReport({
        reportedText: trimmed,
        reportType,
        context,
        matchedFoodId,
        userNote: note,
        userEstimate: {
          calories: calories.trim() ? Number(calories) : undefined,
          protein: protein.trim() ? Number(protein) : undefined,
        },
      });
      if (res.ok) {
        haptic("success");
        toast.success(t("toastSuccess"));
        setDone(true);
      } else {
        setError(res.error || t("genericError"));
      }
    } catch {
      setError(t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {done ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-base font-semibold text-foreground">{t("successTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("successBody")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{intro}</p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("foodLabel")}</span>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("foodPlaceholder")}
              disabled={submitting}
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("noteLabel")}</span>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              disabled={submitting}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">{t("estLabel")}</span>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder={t("calories")}
                disabled={submitting}
                className="w-full"
              />
              <Input
                type="number"
                inputMode="numeric"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder={t("protein")}
                disabled={submitting}
                className="w-full"
              />
            </div>
            <span className="text-xs text-muted-foreground">{t("estHint")}</span>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex gap-2">
            <Button onClick={submit} loading={submitting} fullWidth>
              {submitting ? t("sending") : t("submit")}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
