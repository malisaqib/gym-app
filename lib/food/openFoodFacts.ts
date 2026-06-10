/**
 * Phase 4 - Open Food Facts (packaged/barcode foods). SERVER ONLY.
 *
 * OFF is crowd-sourced and ODbL-licensed. We use it for LOGGING packaged foods
 * by barcode only - never for diet-plan generation (cached rows are stored with
 * source='openfoodfacts', verified=false, plan_eligible=false). Data quality
 * varies, so we require energy + all three macros and otherwise return null
 * (the caller then falls back to the existing estimate/report flow).
 *
 * `parseOffProduct` is a pure function (no I/O) so it is unit-tested; only
 * `fetchOffProduct` touches the network.
 */

const OFF_ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
// OFF policy asks API users to identify themselves with a descriptive UA.
const OFF_USER_AGENT = "FitCoach/0.1 (fitness PWA; food logging)";

export interface OffFood {
  barcode: string;
  name: string;
  brand: string | null;
  servingName: string | null;
  servingGrams: number | null;
  // Per 100 g (canonical) + per the stated portion (serving if known, else 100 g).
  per100: { calories: number; protein: number; carbs: number; fat: number };
  portion: string;
  portionGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

function displayNameWithBrand(name: string, brand: string | null): string {
  if (!brand) return name;
  if (name.toLowerCase().includes(brand.toLowerCase())) return name;
  return `${name} (${brand})`;
}

/** Normalise a raw OFF API response into an OffFood, or null if too low-quality. */
export function parseOffProduct(barcode: string, body: unknown): OffFood | null {
  const root = (body ?? {}) as { status?: number; product?: Record<string, unknown> };
  if (root.status !== 1 || !root.product) return null;
  const p = root.product;
  const nutr = (p.nutriments ?? {}) as Record<string, unknown>;

  const name = String((p.product_name as string) || (p.product_name_en as string) || "").trim();
  if (!name) return null;

  // Energy: prefer kcal; else convert kJ (energy_100g) to kcal.
  const kcal100 = num(nutr["energy-kcal_100g"]) ?? (num(nutr["energy_100g"]) != null ? num(nutr["energy_100g"])! / 4.184 : undefined);
  const protein100 = num(nutr["proteins_100g"]);
  const carbs100 = num(nutr["carbohydrates_100g"]);
  const fat100 = num(nutr["fat_100g"]);

  // Require energy + all three macros. Reject incomplete/placeholder rows so
  // the caller can fall back to an estimate/report flow.
  if (kcal100 == null || kcal100 <= 0) return null;
  if (protein100 == null || carbs100 == null || fat100 == null) return null;

  const per100 = {
    calories: Math.round(kcal100),
    protein: Math.round(protein100),
    carbs: Math.round(carbs100),
    fat: Math.round(fat100),
  };

  const brand = String((p.brands as string) || "").split(",")[0]?.trim() || null;
  const servingGrams = num(p.serving_quantity);
  const servingName = String((p.serving_size as string) || "").trim() || null;

  const hasServing = servingGrams != null && servingGrams > 0;
  const portionGrams = hasServing ? servingGrams! : 100;
  const factor = portionGrams / 100;
  const portion = hasServing ? servingName || `${portionGrams} g` : "100 g";

  return {
    barcode,
    name: displayNameWithBrand(name, brand),
    brand,
    servingName,
    servingGrams: hasServing ? servingGrams! : null,
    per100,
    portion,
    portionGrams,
    calories: Math.round(per100.calories * factor),
    protein: Math.round(per100.protein * factor),
    carbs: Math.round(per100.carbs * factor),
    fat: Math.round(per100.fat * factor),
  };
}

/** Fetch a product from Open Food Facts by barcode. Returns null on miss/low-quality/error. */
export async function fetchOffProduct(barcode: string): Promise<OffFood | null> {
  const code = barcode.replace(/\D+/g, "");
  if (code.length < 6 || code.length > 14) return null; // EAN/UPC sanity

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `${OFF_ENDPOINT}/${code}.json?fields=product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`,
      { headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" }, signal: controller.signal }
    );
    if (!res.ok) return null;
    const body = await res.json();
    return parseOffProduct(code, body);
  } catch {
    return null; // network/timeout/parse: caller degrades to estimate
  } finally {
    clearTimeout(timeout);
  }
}
