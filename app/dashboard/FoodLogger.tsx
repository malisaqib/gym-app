"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Camera, Flag, ScanBarcode, UtensilsCrossed } from "lucide-react";
import type { FoodLog, Lang, ReportContext, ReportType } from "@/lib/database.types";
import { listContainer, listItem, fadeUp } from "@/lib/motion";
import { sumMacros } from "@/lib/food/totals";
import { itemMacros } from "@/lib/food/quantity";
import { localDateString } from "@/lib/localDate";
import {
  logFood,
  getFoodLogs,
  setFoodItemAmount,
  correctFoodItem,
  deleteFoodItem,
  searchLogFoods,
  logSearchedFood,
  lookupBarcode,
  type LogFoodSearchOption,
} from "./actions";
import QuantityControl, { type QtySpec } from "@/components/QuantityControl";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityRing } from "@/components/ui/ActivityRing";
import { Counter } from "@/components/ui/Counter";
import { WeekStrip } from "@/components/ui/WeekStrip";
import ReportFoodSheet from "@/components/ReportFoodSheet";

// A food report being composed (drives the shared report sheet). Kept after
// close so the sheet's exit animation can play before it clears.
interface ReportTarget {
  reportType: ReportType;
  context: ReportContext;
  text: string;
  matchedFoodId: string | null;
}

const REPORT_T = {
  cantFind: { en: "Can't find that? Tell us and we'll add it.", roman_urdu: "Nahi mila? Bataayein, hum add kar dein ge." },
  report: { en: "Report", roman_urdu: "Report" },
  noExact: { en: "No exact match. Log will estimate it.", roman_urdu: "Exact match nahi mila. Log estimate kar de ga." },
  showMore: { en: "Show more", roman_urdu: "Aur dikhayein" },
  showLess: { en: "Show less", roman_urdu: "Kam dikhayein" },
  barcodeReport: { en: "Report missing packaged food", roman_urdu: "Packaged food missing report karein" },
} satisfies Record<string, Record<Lang, string>>;

// A meal being parsed by the LLM — shown immediately so logging feels instant.
interface PendingLog {
  tempId: string;
  text: string;
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
type BarcodeWindow = Window & { BarcodeDetector?: BarcodeDetectorConstructor };

export default function FoodLogger({
  calorieTarget,
  proteinTarget,
  initialItems,
  today,
  lang = "en",
}: {
  calorieTarget: number;
  proteinTarget: number;
  initialItems: FoodLog[];
  today: string;
  lang?: Lang;
}) {
  const rt = (k: keyof typeof REPORT_T) => REPORT_T[k][lang];

  // Seeded from the server — no mount fetch, so the list is there on first paint.
  const [items, setItems] = useState<FoodLog[]>(initialItems);
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [foodSearching, setFoodSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LogFoodSearchOption[]>([]);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [pickPending, setPickPending] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [barcodePending, setBarcodePending] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<LogFoodSearchOption | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeMissingCode, setBarcodeMissingCode] = useState<string | null>(null);
  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // The last meal the parser couldn't recognise — offers a "report missing" CTA.
  const [unrecognized, setUnrecognized] = useState<string | null>(null);
  // The shared report sheet: target data + open flag (data persists across close
  // so the exit animation plays).
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  function openReport(target: ReportTarget) {
    setReportTarget(target);
    setReportOpen(true);
  }
  // Tracks in-flight logs so a focus-refetch doesn't clobber an optimistic add.
  const inFlight = useRef(0);
  // Per-item debounce timers for quantity edits (coalesce rapid +/- taps).
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeVideo = useRef<HTMLVideoElement | null>(null);
  const barcodeStream = useRef<MediaStream | null>(null);
  const barcodeFrame = useRef<number | null>(null);
  const barcodeScanning = useRef(false);

  const stopBarcodeCamera = useCallback(() => {
    barcodeScanning.current = false;
    if (barcodeFrame.current != null) {
      window.cancelAnimationFrame(barcodeFrame.current);
      barcodeFrame.current = null;
    }
    if (barcodeStream.current) {
      barcodeStream.current.getTracks().forEach((track) => track.stop());
      barcodeStream.current = null;
    }
    if (barcodeVideo.current) barcodeVideo.current.srcObject = null;
    setCameraActive(false);
  }, []);

  // Totals are computed on the fly (base × amount) — never a frozen number.
  const eaten = sumMacros(items.map(itemMacros));

  useEffect(() => {
    const w = window as BarcodeWindow;
    setCameraSupported(Boolean(w.BarcodeDetector && navigator.mediaDevices?.getUserMedia));
  }, []);

  useEffect(() => () => stopBarcodeCamera(), [stopBarcodeCamera]);

  useEffect(() => {
    if (!barcodeOpen) stopBarcodeCamera();
  }, [barcodeOpen, stopBarcodeCamera]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const query = text.trim();
    setSearchExpanded(false);
    if (query.length < 2) {
      setSearchResults([]);
      setFoodSearching(false);
      return;
    }

    let cancelled = false;
    setFoodSearching(true);
    searchTimer.current = setTimeout(async () => {
      const res = await searchLogFoods(query);
      if (cancelled) return;
      setSearchResults(res.ok ? res.foods : []);
      setFoodSearching(false);
    }, 250);

    return () => {
      cancelled = true;
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [text]);

  // Re-read the day's items when the tab regains focus, and re-align if the
  // CLIENT's local day differs from the server-rendered day (first-visit UTC
  // fallback, or the tab being left open across local midnight). This is the
  // server (DB) truth, so nothing "disappears" just because the page was stale.
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (inFlight.current > 0) return; // don't fight an optimistic add mid-write
      const rows = await getFoodLogs(localDateString());
      if (!cancelled) setItems(rows);
    }
    // Align on mount only when the client's real day != the day we rendered for.
    if (localDateString() !== today) void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [today]);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const meal = text.trim();
    if (!meal) return;

    // OPTIMISTIC: show a "reading…" row and clear the input right away.
    const tempId = crypto.randomUUID();
    setPending((p) => [...p, { tempId, text: meal }]);
    setText("");
    setError(null);
    setUnrecognized(null);
    inFlight.current += 1;

    try {
      // Write with the user's LIVE local day (not the stale render-time prop),
      // so the item lands on the day the dashboard will query next.
      const res = await logFood({ text: meal, date: localDateString() });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
      } else {
        setError(res.error);
        setText(meal); // never silently drop the user's input — let them retry
        // Only offer "report missing food" when the parser genuinely found
        // nothing (not for network/parse errors).
        if (res.reason === "no_match") setUnrecognized(meal);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setText(meal);
    } finally {
      setPending((p) => p.filter((x) => x.tempId !== tempId));
      inFlight.current -= 1;
    }
  }

  async function handlePickSearchResult(optionId: string): Promise<boolean> {
    setPickPending(true);
    setError(null);
    setUnrecognized(null);
    inFlight.current += 1;
    try {
      const res = await logSearchedFood({ optionId, date: localDateString() });
      if (res.ok) {
        setItems((prev) => [...prev, ...res.items]);
        setText("");
        setSearchResults([]);
        return true;
      } else {
        setError(res.error);
        return false;
      }
    } catch {
      setError("Couldn't log that food. Please try again.");
      return false;
    } finally {
      inFlight.current -= 1;
      setPickPending(false);
    }
  }

  async function handleBarcodeLookup(value = barcode) {
    const code = value.replace(/\D+/g, "");
    if (!code) {
      setBarcodeError("Enter a barcode number.");
      return;
    }

    setBarcode(code);
    stopBarcodeCamera();
    setBarcodePending(true);
    setBarcodeError(null);
    setBarcodeMissingCode(null);
    setBarcodeResult(null);
    setUnrecognized(null);
    try {
      const res = await lookupBarcode(code);
      if (res.ok) {
        setBarcodeResult(res.food);
      } else {
        setBarcodeError(res.error);
        if (res.reason === "not_found") setBarcodeMissingCode(code);
      }
    } catch {
      setBarcodeError("Couldn't look up that barcode. Please try again.");
    } finally {
      setBarcodePending(false);
    }
  }

  async function handlePickBarcodeResult() {
    if (!barcodeResult) return;
    const ok = await handlePickSearchResult(barcodeResult.id);
    if (!ok) return;
    setBarcode("");
    setBarcodeResult(null);
    setBarcodeError(null);
    setBarcodeMissingCode(null);
    setBarcodeOpen(false);
    stopBarcodeCamera();
  }

  async function startBarcodeCamera() {
    const Detector = (window as BarcodeWindow).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera scanning isn't available in this browser.");
      return;
    }

    setCameraError(null);
    setBarcodeError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      barcodeStream.current = stream;

      const video = barcodeVideo.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        barcodeStream.current = null;
        return;
      }

      video.srcObject = stream;
      await video.play();
      setCameraActive(true);

      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      barcodeScanning.current = true;

      const scanFrame = async () => {
        if (!barcodeScanning.current) return;
        const currentVideo = barcodeVideo.current;
        if (currentVideo && currentVideo.readyState >= 2) {
          try {
            const codes = await detector.detect(currentVideo);
            const raw = codes.find((code) => code.rawValue)?.rawValue.replace(/\D+/g, "");
            if (raw) {
              stopBarcodeCamera();
              void handleBarcodeLookup(raw);
              return;
            }
          } catch {
            stopBarcodeCamera();
            setCameraError("Couldn't scan that barcode. Enter it manually.");
            return;
          }
        }
        barcodeFrame.current = window.requestAnimationFrame(scanFrame);
      };

      barcodeFrame.current = window.requestAnimationFrame(scanFrame);
    } catch {
      stopBarcodeCamera();
      setCameraError("Couldn't start the camera. Enter the barcode instead.");
    }
  }

  // Clear any pending quantity-save timers on unmount.
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  // Adjust HOW MUCH was eaten: optimistic + live (itemMacros recomputes the row
  // AND the rings), persisted on a short debounce. On failure we reconcile with
  // the DB so a change is never silently dropped or left phantom.
  function changeAmount(id: string, amount: number) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, amount, source: "corrected" } : i)));
    setError(null);
    if (timers.current[id]) clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      inFlight.current += 1;
      try {
        const res = await setFoodItemAmount(id, amount);
        if (res.ok) {
          setItems((prev) => prev.map((i) => (i.id === id ? res.item : i)));
        } else {
          setError(res.error);
          setItems(await getFoodLogs(localDateString())); // reconcile with DB truth
        }
      } catch {
        setError("Couldn't save the amount. Please try again.");
        setItems(await getFoodLogs(localDateString()));
      } finally {
        inFlight.current -= 1;
      }
    }, 450);
  }

  // Manual exact-numbers correction (optimistic + rollback). Stores the entered
  // total as per-unit base at the current amount so it stays consistent + scales.
  async function correctItem(id: string, patch: { calories: number; protein_g: number }) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const amt = i.amount && i.amount > 0 ? i.amount : 1;
        return {
          ...i,
          calories: patch.calories,
          protein_g: patch.protein_g,
          base_calories: patch.calories / amt,
          base_protein_g: patch.protein_g / amt,
          source: "corrected",
        };
      })
    );
    const res = await correctFoodItem(id, patch);
    if (!res.ok) {
      setItems(snapshot);
      setError(res.error);
    } else {
      setItems((prev) => prev.map((i) => (i.id === id ? res.item : i)));
    }
  }

  // OPTIMISTIC delete: remove now, restore on error.
  async function removeItem(id: string) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const res = await deleteFoodItem(id);
    if (!res.ok) {
      setItems(snapshot);
      setError(res.error ?? "Couldn't delete that.");
    }
  }

  const count = items.length + pending.length;
  const query = text.trim();
  const visibleSearchResults = searchExpanded ? searchResults : searchResults.slice(0, 8);

  return (
    <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-7">
      {/* Current-week date strip (visual only). */}
      <motion.div variants={fadeUp}>
        <WeekStrip />
      </motion.div>

      {/* Hero: two separate rings — calories and protein, side by side. */}
      <motion.section variants={fadeUp}>
        <div className="grid grid-cols-2 gap-2 rounded-card-xl border border-border bg-card p-5">
          <RingStat label="Calories" value={eaten.calories} max={calorieTarget} unit="kcal" tone="primary" />
          <RingStat label="Protein" value={eaten.protein_g} max={proteinTarget} unit="g" tone="accent" />
        </div>
      </motion.section>

      {/* Log food by text */}
      <motion.form variants={fadeUp} onSubmit={handleLog} className="flex flex-col gap-2">
        <label className="stat-label">What did you eat?</label>
        <div className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="do roti, ek pyali daal" />
          <Button
            type="button"
            variant="secondary"
            aria-label="Barcode lookup"
            title="Barcode lookup"
            onClick={() => {
              setBarcodeOpen((v) => !v);
              setBarcodeError(null);
              setCameraError(null);
            }}
            className="shrink-0 px-3"
          >
            <ScanBarcode size={18} aria-hidden />
          </Button>
          <Button type="submit" disabled={!text.trim()}>
            Log
          </Button>
        </div>
        {barcodeOpen && (
          <div className="rounded-card-lg border border-border bg-card p-3">
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value.replace(/\D+/g, ""));
                  setBarcodeError(null);
                  setBarcodeMissingCode(null);
                  setBarcodeResult(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleBarcodeLookup();
                  }
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Barcode number"
              />
              <Button
                type="button"
                variant="secondary"
                loading={barcodePending}
                disabled={!barcode.trim()}
                onClick={() => handleBarcodeLookup()}
              >
                Find
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {cameraSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cameraActive ? stopBarcodeCamera : startBarcodeCamera}
                  className="px-2"
                >
                  <Camera size={15} aria-hidden />
                  {cameraActive ? "Stop camera" : "Use camera"}
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground">
                Data:{" "}
                <a
                  href="https://world.openfoodfacts.org"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Open Food Facts
                </a>{" "}
                (ODbL)
              </span>
            </div>

            {cameraSupported && (
              <video
                ref={barcodeVideo}
                muted
                playsInline
                className={cameraActive ? "mt-3 aspect-[4/3] w-full rounded-card-lg bg-black object-cover" : "hidden"}
              />
            )}
            {cameraError && <p className="mt-2 px-1 text-xs text-muted-foreground">{cameraError}</p>}
            {barcodeError && (
              <div className="mt-2 space-y-1">
                <Alert tone="error">{barcodeError}</Alert>
                {barcodeMissingCode && (
                  <button
                    type="button"
                    onClick={() =>
                      openReport({
                        reportType: "missing",
                        context: "home_log",
                        text: `Barcode ${barcodeMissingCode}`,
                        matchedFoodId: null,
                      })
                    }
                    className="px-1 text-xs font-medium text-primary underline-offset-2 hover:underline active:scale-[0.99]"
                  >
                    {rt("barcodeReport")}
                  </button>
                )}
              </div>
            )}
            {barcodeResult && (
              <button
                type="button"
                disabled={pickPending}
                onClick={handlePickBarcodeResult}
                className="mt-2 flex w-full items-center justify-between gap-3 rounded-field border border-border px-2.5 py-2 text-left transition hover:bg-muted active:scale-[0.99] disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{barcodeResult.name}</span>
                    <FoodQualityBadge quality={barcodeResult.quality} label={barcodeResult.label} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{barcodeResult.portion}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {barcodeResult.calories} kcal | {barcodeResult.protein}g
                </span>
              </button>
            )}
          </div>
        )}
        {foodSearching && <p className="px-1 text-xs text-muted-foreground">Searching...</p>}
        {visibleSearchResults.length > 0 && (
          <div className="rounded-card-lg border border-border bg-card p-2">
            <ul className="flex flex-col gap-1">
              {visibleSearchResults.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    disabled={pickPending}
                    onClick={() => handlePickSearchResult(food.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-field px-2.5 py-2 text-left transition hover:bg-muted active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{food.name}</span>
                        <FoodQualityBadge quality={food.quality} label={food.label} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{food.portion}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {food.calories} kcal · {food.protein}g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {searchResults.length > 8 && (
              <button
                type="button"
                onClick={() => setSearchExpanded((v) => !v)}
                className="mt-1 px-2 text-xs font-medium text-primary underline-offset-2 hover:underline"
              >
                {searchExpanded ? rt("showLess") : rt("showMore")}
              </button>
            )}
          </div>
        )}
        {!foodSearching && query.length >= 2 && searchResults.length === 0 && (
          <div className="space-y-1 px-1">
            <p className="text-xs text-muted-foreground">{rt("noExact")}</p>
            <button
              type="button"
              onClick={() => openReport({ reportType: "missing", context: "home_log", text: query, matchedFoodId: null })}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline active:scale-[0.99]"
            >
              {rt("cantFind")}
            </button>
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {/* Primary trigger: parser found nothing → offer to report it as missing. */}
        {unrecognized && (
          <button
            type="button"
            onClick={() =>
              openReport({ reportType: "missing", context: "home_log", text: unrecognized, matchedFoodId: null })
            }
            className="self-start text-sm font-medium text-primary underline-offset-2 hover:underline active:scale-[0.99]"
          >
            {rt("cantFind")}
          </button>
        )}
      </motion.form>

      {/* Today's items */}
      <motion.section variants={fadeUp} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
          Today{count > 0 ? ` · ${count}` : ""}
        </h2>

        {count === 0 ? (
          <EmptyState icon={UtensilsCrossed} title="Nothing logged yet" hint="Type a meal above to get started." />
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <motion.div key={item.id} variants={listItem} exit="exit" layout>
                  <FoodItemRow
                    item={item}
                    lang={lang}
                    onAmountChange={changeAmount}
                    onCorrect={correctItem}
                    onDelete={removeItem}
                    onReport={(it) =>
                      openReport({ reportType: "incorrect", context: "home_log", text: it.food_name, matchedFoodId: null })
                    }
                  />
                </motion.div>
              ))}
              {pending.map((p) => (
                <motion.div key={p.tempId} variants={listItem} exit="exit" layout>
                  <PendingRow text={p.text} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.section>

      {/* Shared report sheet (missing from the log form, incorrect from a row). */}
      <ReportFoodSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reportType={reportTarget?.reportType ?? "missing"}
        context={reportTarget?.context ?? "home_log"}
        reportedText={reportTarget?.text ?? ""}
        matchedFoodId={reportTarget?.matchedFoodId ?? null}
        lang={lang}
      />
    </motion.div>
  );
}

// One daily metric as its own ring: a big count-up number inside the ring, with
// a muted label above and "X left" below. Calories = emerald, protein = amber.
function RingStat({
  label,
  value,
  max,
  unit,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  tone: "primary" | "accent";
}) {
  const left = Math.round(max - value);
  const over = max > 0 && value > max;
  const ringColor = over ? "rgb(var(--destructive))" : tone === "accent" ? "rgb(var(--ring-2))" : "rgb(var(--ring-1))";
  const leftColor = over ? "text-destructive" : tone === "accent" ? "text-accent" : "text-primary";

  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="stat-label">{label}</p>
      <ActivityRing value={value} max={max} color={ringColor} size={132} stroke={13}>
        <div className="flex flex-col items-center">
          <Counter value={value} className="stat-value text-2xl text-foreground" />
          <span className="text-[10px] text-muted-foreground">
            of {Math.round(max)} {unit}
          </span>
        </div>
      </ActivityRing>
      <p className={`text-xs font-semibold ${leftColor}`}>
        {over ? `${Math.abs(left)} ${unit} over` : `${left} ${unit} left`}
      </p>
    </div>
  );
}

// A meal still being parsed — instant feedback while the LLM works.
function FoodQualityBadge({ quality, label }: { quality: LogFoodSearchOption["quality"]; label: string }) {
  const tone =
    quality === "verified" ? "success" : quality === "recent" ? "primary" : quality === "estimated" ? "warning" : "muted";
  return <Badge tone={tone}>{label}</Badge>;
}

function PendingRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card-lg border border-border bg-card p-4 opacity-70">
      <Spinner size="sm" className="text-primary" label="Reading your meal" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{text}</p>
        <p className="text-xs text-muted-foreground">Reading…</p>
      </div>
    </div>
  );
}

// --- one food item, with inline one-tap correction ------------------------

function FoodItemRow({
  item,
  lang,
  onAmountChange,
  onCorrect,
  onDelete,
  onReport,
}: {
  item: FoodLog;
  lang: Lang;
  onAmountChange: (id: string, amount: number) => void;
  onCorrect: (id: string, patch: { calories: number; protein_g: number }) => void;
  onDelete: (id: string) => void;
  onReport: (item: FoodLog) => void;
}) {
  const [editing, setEditing] = useState(false);
  const m = itemMacros(item); // live total = base × amount
  const amount = item.amount ?? 1;
  // Editable exact numbers shown alongside quantity. They follow the quantity
  // (resync when amount changes); a manual edit + Save overrides them.
  const [cal, setCal] = useState(String(m.calories));
  const [pro, setPro] = useState(String(m.protein_g));
  useEffect(() => {
    const t = itemMacros(item);
    setCal(String(t.calories));
    setPro(String(t.protein_g));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);
  const qtyLabel =
    item.unit_mode === "portion"
      ? `${amount} g`
      : `${amount}${item.unit && item.unit !== "item" ? ` ${item.unit}` : ""}`;

  // base = per unit (count) or per gram (portion); fall back to stored totals.
  const spec: QtySpec = {
    unitMode: item.unit_mode ?? "count",
    baseCalories: item.base_calories ?? item.calories,
    baseProtein: item.base_protein_g ?? item.protein_g,
    baseCarbs: item.base_carbs_g ?? item.carbs_g,
    baseFat: item.base_fat_g ?? item.fat_g,
    servingGrams: item.serving_grams,
    unit: item.unit && item.unit !== "item" ? item.unit : "",
  };

  return (
    <div className="rounded-card-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {item.food_name}
            <span className="font-normal text-muted-foreground"> · {qtyLabel}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{m.calories}</span> kcal ·{" "}
            <span className="font-semibold text-accent tabular-nums">{m.protein_g}g</span> protein
            {item.source === "llm" && <Badge tone="warning">estimated</Badge>}
            {item.source === "corrected" && <Badge tone="primary">edited</Badge>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={REPORT_T.report[lang]}
            title={REPORT_T.report[lang]}
            onClick={() => onReport(item)}
            className="px-2 text-muted-foreground hover:text-foreground"
          >
            <Flag size={15} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            className="text-destructive hover:bg-destructive/10"
          >
            Delete
          </Button>
        </div>
      </div>

      {editing && (
        <>
          <QuantityControl spec={spec} amount={amount} onChange={(a) => onAmountChange(item.id, a)} />
          {/* Exact calories + protein, shown with the quantity. Follow the qty;
              hand-edit + Save to override. */}
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Calories
              <Input type="number" value={cal} onChange={(e) => setCal(e.target.value)} className="h-10 w-24" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Protein (g)
              <Input type="number" value={pro} onChange={(e) => setPro(e.target.value)} className="h-10 w-24" />
            </label>
            <Button size="sm" onClick={() => onCorrect(item.id, { calories: Number(cal), protein_g: Number(pro) })}>
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
