// Seeds the `foods` RAG table with a curated bi-cuisine catalog and Gemini
// embeddings. OFFLINE script — run manually, never imported by the app.
//
//   node --env-file=.env.local scripts/seed-foods.mjs
//
// Needs in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// GEMINI_API_KEY. The service-role key bypasses RLS so it can write the table.
//
// This is v1 (curated). R1b will add a USDA FoodData Central bulk import to
// scale to thousands with sourced values; those rows will use source 'usda_*'.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
// gemini-embedding-001 defaults to 3072 dims; we truncate (Matryoshka) to 768
// to match the vector(768) column, and L2-normalize (recommended when < 3072).
// The app's runtime query embedding MUST use the same model + dim + normalize.
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

if (!SUPABASE_URL || !SERVICE_ROLE || !GEMINI_KEY) {
  console.error("Missing env: need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY");
  process.exit(1);
}

// d = desi, w = western, g = global. Macros are per the stated portion.
// [name, aliases, region, portion, grams, kcal, protein, carbs, fat]
const FOODS = [
  // ---- desi: breads ----
  ["Roti / chapati", ["roti", "chapati", "phulka"], "d", "1 medium (~45g)", 45, 110, 3, 22, 2],
  ["Naan", ["naan"], "d", "1 plain (~90g)", 90, 260, 9, 50, 5],
  ["Paratha", ["paratha", "parantha"], "d", "1 plain (~60g)", 60, 280, 5, 36, 13],
  // ---- desi: rice ----
  ["Boiled rice", ["chawal", "plain rice", "boiled rice"], "d", "1 katori (~150g cooked)", 150, 200, 4, 44, 1],
  ["Chicken biryani", ["biryani", "biriyani"], "d", "1 plate (~350g)", 350, 550, 22, 65, 22],
  ["Pulao", ["pulao", "pilau", "yakhni pulao"], "d", "1 plate (~300g)", 300, 450, 18, 58, 15],
  // ---- desi: daals & veg ----
  ["Daal (lentils)", ["daal", "dal", "masoor", "moong", "maash", "lentils"], "d", "1 katori (~200g)", 200, 150, 9, 22, 3],
  ["Chana / chickpea curry", ["chana", "cholay", "chole", "chickpea curry"], "d", "1 katori (~200g)", 200, 190, 9, 27, 5],
  ["Palak / saag", ["palak", "saag", "spinach curry"], "d", "1 katori (~200g)", 200, 180, 6, 12, 12],
  ["Aloo curry", ["aloo", "potato curry", "aloo ki sabzi"], "d", "1 katori (~200g)", 200, 200, 4, 28, 9],
  ["Mixed vegetable sabzi", ["sabzi", "mix sabzi", "bhujia"], "d", "1 katori (~200g)", 200, 170, 4, 18, 10],
  // ---- desi: meat curries ----
  ["Chicken karahi", ["karahi", "kadai", "chicken karahi"], "d", "1 serving (~250g)", 250, 400, 35, 8, 26],
  ["Chicken curry / salan", ["chicken salan", "chicken curry", "shorba", "salan"], "d", "1 serving (~200g)", 200, 300, 28, 8, 18],
  ["Qeema (minced meat)", ["qeema", "keema", "mince"], "d", "1 katori (~150g)", 150, 350, 22, 5, 26],
  ["Aloo gosht", ["aloo gosht", "mutton curry", "beef curry"], "d", "1 serving (~250g)", 250, 360, 24, 12, 22],
  ["Nihari", ["nihari"], "d", "1 bowl (~250g)", 250, 450, 28, 10, 33],
  ["Haleem", ["haleem", "daleem"], "d", "1 bowl (~250g)", 250, 300, 18, 28, 13],
  // ---- desi: kababs & grilled ----
  ["Seekh kabab", ["seekh kabab", "seekh kebab"], "d", "1 kabab (~60g)", 60, 120, 9, 2, 8],
  ["Chapli kabab", ["chapli kabab", "chapli kebab"], "d", "1 kabab (~100g)", 100, 250, 14, 6, 18],
  ["Chicken tikka", ["tikka", "chicken tikka"], "d", "1 piece (leg, ~120g)", 120, 180, 22, 2, 9],
  ["Shami kabab", ["shami kabab", "shami"], "d", "1 kabab (~50g)", 50, 100, 6, 5, 6],
  // ---- desi: dairy & drinks ----
  ["Dahi (plain yogurt)", ["dahi", "curd"], "d", "1 katori (~150g)", 150, 90, 5, 8, 4],
  ["Raita", ["raita"], "d", "1 katori (~150g)", 150, 90, 4, 8, 4],
  ["Sweet lassi", ["lassi", "sweet lassi"], "d", "1 glass (~250ml)", 250, 180, 6, 28, 5],
  ["Milk (full cream)", ["milk", "doodh"], "d", "1 cup (~250ml)", 250, 150, 8, 12, 8],
  ["Chai (milk tea, sugar)", ["chai", "tea", "doodh patti"], "d", "1 cup (~150ml)", 150, 120, 3, 18, 4],
  // ---- desi: snacks & sweets ----
  ["Samosa", ["samosa", "samosay"], "d", "1 (~60g)", 60, 150, 3, 17, 8],
  ["Pakora", ["pakora", "pakoray", "bhajia"], "d", "1 plate (~100g)", 100, 300, 8, 28, 18],
  ["Kheer", ["kheer", "rice pudding"], "d", "1 katori (~150g)", 150, 250, 6, 40, 8],
  ["Gulab jamun", ["gulab jamun", "gulab jaman"], "d", "1 piece", 40, 150, 2, 25, 5],
  ["Jalebi", ["jalebi"], "d", "1 piece (~30g)", 30, 150, 1, 25, 5],
  // ---- desi/global: staples & eggs ----
  ["Egg (boiled/fried)", ["anda", "egg", "boiled egg", "fried egg"], "g", "1 egg", 50, 80, 6, 1, 5],
  ["Omelette (2 eggs)", ["omelette", "omelet", "anda omelette"], "g", "2 eggs", 120, 200, 12, 2, 16],
  ["Chicken breast (cooked)", ["chicken breast", "grilled chicken"], "g", "100g", 100, 165, 31, 0, 4],
  ["White bread", ["bread", "double roti", "bread slice"], "g", "1 slice", 28, 75, 2, 14, 1],

  // ---- western: breakfast ----
  ["Oatmeal (cooked)", ["oatmeal", "oats", "porridge"], "w", "1 cup (234g)", 234, 150, 5, 27, 3],
  ["Cornflakes", ["cornflakes", "corn flakes"], "w", "1 cup (28g) + milk", 28, 100, 2, 24, 0],
  ["Granola", ["granola"], "w", "1/2 cup (61g)", 61, 280, 7, 38, 12],
  ["Scrambled eggs", ["scrambled eggs"], "w", "2 eggs (~110g)", 110, 180, 12, 2, 14],
  ["Pancakes", ["pancakes", "pancake"], "w", "2 (~80g)", 80, 175, 5, 22, 7],
  ["French toast", ["french toast"], "w", "1 slice", 65, 150, 5, 16, 7],
  ["Bacon", ["bacon"], "w", "2 slices (16g)", 16, 90, 6, 0, 7],
  ["Pork sausage", ["sausage", "breakfast sausage"], "w", "1 link (~25g)", 25, 90, 5, 0, 8],
  ["Greek yogurt (plain)", ["greek yogurt"], "w", "1 container (170g)", 170, 100, 17, 6, 1],
  // ---- western: mains & fast food ----
  ["Hamburger (plain)", ["hamburger", "burger"], "w", "1 (~110g)", 110, 250, 13, 30, 9],
  ["Cheeseburger", ["cheeseburger"], "w", "1 (~115g)", 115, 300, 15, 30, 14],
  ["Cheese pizza", ["pizza", "cheese pizza"], "w", "1 slice (~107g)", 107, 285, 12, 36, 10],
  ["Pepperoni pizza", ["pepperoni pizza"], "w", "1 slice (~110g)", 110, 310, 13, 36, 12],
  ["French fries", ["fries", "french fries", "chips"], "w", "medium (117g)", 117, 365, 4, 48, 17],
  ["Fried chicken", ["fried chicken", "crispy chicken"], "w", "1 drumstick (~90g)", 90, 195, 16, 6, 11],
  ["Hot dog (with bun)", ["hot dog", "hotdog"], "w", "1", 100, 290, 10, 24, 17],
  ["Beef taco", ["taco"], "w", "1", 75, 170, 8, 13, 9],
  ["Bean & cheese burrito", ["burrito"], "w", "1 (~110g)", 110, 300, 9, 40, 11],
  ["Turkey sandwich", ["turkey sandwich", "sandwich"], "w", "1", 200, 320, 20, 35, 9],
  ["Grilled cheese sandwich", ["grilled cheese"], "w", "1", 120, 400, 14, 33, 24],
  ["Chicken caesar wrap", ["caesar wrap", "chicken wrap"], "w", "1", 250, 430, 28, 33, 20],
  ["Sushi roll (California)", ["sushi", "california roll"], "w", "6 pieces", 170, 255, 9, 38, 7],
  ["Instant ramen (prepared)", ["ramen", "instant noodles", "maggi"], "g", "1 pack", 300, 380, 8, 52, 14],
  // ---- western: proteins ----
  ["Salmon (cooked)", ["salmon"], "w", "100g", 100, 206, 22, 0, 13],
  ["Canned tuna (in water)", ["tuna", "canned tuna"], "w", "1 can (142g)", 142, 130, 30, 0, 1],
  ["Beef steak (cooked)", ["steak", "beef steak"], "w", "100g", 100, 271, 25, 0, 19],
  ["Ground beef (cooked)", ["ground beef", "beef mince"], "w", "100g", 100, 250, 26, 0, 15],
  // ---- western: sides & carbs ----
  ["Pasta (cooked)", ["pasta", "noodles"], "w", "1 cup (140g)", 140, 220, 8, 43, 1],
  ["Spaghetti with marinara", ["spaghetti", "spaghetti marinara"], "w", "1 cup", 250, 220, 8, 43, 4],
  ["Mac and cheese", ["mac and cheese", "macaroni cheese"], "w", "1 cup (200g)", 200, 310, 11, 40, 12],
  ["Baked potato", ["baked potato"], "w", "1 medium (173g)", 173, 160, 4, 37, 0],
  ["Mashed potatoes", ["mashed potato", "mashed potatoes"], "w", "1 cup (210g)", 210, 215, 4, 35, 9],
  ["Brown rice (cooked)", ["brown rice"], "w", "1 cup (195g)", 195, 215, 5, 45, 2],
  // ---- western: snacks & extras ----
  ["Cheddar cheese", ["cheddar", "cheese"], "w", "1 slice (28g)", 28, 115, 7, 1, 9],
  ["Peanut butter", ["peanut butter"], "w", "2 tbsp (32g)", 32, 190, 7, 7, 16],
  ["Almonds", ["almonds"], "w", "1 oz (28g)", 28, 165, 6, 6, 14],
  ["Whey protein shake", ["whey", "protein shake", "protein powder"], "w", "1 scoop (~31g)", 31, 120, 24, 3, 2],
  ["Protein bar", ["protein bar"], "w", "1 bar (60g)", 60, 220, 20, 22, 7],
  // ---- global: fruit & veg ----
  ["Banana", ["banana", "kela"], "g", "1 medium (118g)", 118, 105, 1, 27, 0],
  ["Apple", ["apple", "saib"], "g", "1 medium (182g)", 182, 95, 1, 25, 0],
  ["Orange", ["orange", "santra"], "g", "1 medium (131g)", 131, 62, 1, 15, 0],
  ["Avocado", ["avocado"], "g", "half (100g)", 100, 160, 2, 9, 15],
  ["Broccoli (cooked)", ["broccoli"], "g", "1 cup (156g)", 156, 55, 4, 11, 1],
  ["Mixed green salad", ["salad", "green salad"], "g", "1 bowl (no dressing)", 100, 30, 2, 6, 0],
  // ---- global: drinks ----
  ["Orange juice", ["orange juice", "oj"], "g", "1 cup (248g)", 248, 112, 2, 26, 0],
  ["Cola (soft drink)", ["coke", "cola", "soft drink", "pepsi"], "g", "1 can (355ml)", 355, 140, 0, 39, 0],
  ["Black coffee", ["coffee", "black coffee"], "g", "1 cup", 240, 2, 0, 0, 0],
  ["Latte (whole milk)", ["latte", "cafe latte"], "w", "16 oz", 480, 190, 12, 18, 7],
];

const REGION = { d: "desi", w: "western", g: "global" };

const round2 = (n) => Math.round(n * 100) / 100;
const per100 = (value, grams) => (grams > 0 ? round2((value / grams) * 100) : null);

function layeredFoodFields({ portion, grams, kcal, protein, carbs, fat, verified }) {
  return {
    verified,
    brand: null,
    barcode: null,
    serving_name: portion,
    serving_grams: grams,
    calories_per_100g: per100(kcal, grams),
    protein_g_per_100g: per100(protein, grams),
    carbs_g_per_100g: per100(carbs, grams),
    fat_g_per_100g: per100(fat, grams),
    calories_per_serving: kcal,
    protein_g_per_serving: protein,
    carbs_g_per_serving: carbs,
    fat_g_per_serving: fat,
    // Verified for logging/search quality, but not automatically plan-eligible.
    plan_eligible: false,
    classification_status: "unclassified",
    classification_reason: null,
  };
}

async function embed(text, attempt = 0) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIM,
    }),
  });
  // Back off and retry on rate limit / transient errors.
  if ((res.status === 429 || res.status === 503) && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    return embed(text, attempt + 1);
  }
  if (!res.ok) throw new Error(`Gemini embed failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Gemini returned no embedding values");
  // L2-normalize so cosine distances are consistent at the truncated dimension.
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Preflight: confirm the table exists BEFORE we spend Gemini calls. (A HEAD
  // count request doesn't surface a missing-table error, so use a real select.)
  const probe = await supabase.from("foods").select("id").limit(1);
  if (probe.error) {
    console.error("Cannot read `foods` — did migration 0005 apply cleanly? Details:", probe.error.message);
    process.exit(1);
  }

  console.log(`Embedding ${FOODS.length} foods with Gemini ${EMBED_MODEL}…`);
  const rows = [];
  for (let i = 0; i < FOODS.length; i++) {
    const [name, aliases, region, portion, grams, kcal, p, c, f] = FOODS[i];
    const search_text = [name, ...aliases].join(" ");
    const values = await embed(search_text);
    rows.push({
      name,
      aliases,
      search_text,
      region: REGION[region],
      portion,
      portion_grams: grams,
      calories: kcal,
      protein_g: p,
      carbs_g: c,
      fat_g: f,
      source: "curated",
      ...layeredFoodFields({
        portion,
        grams,
        kcal,
        protein: p,
        carbs: c,
        fat: f,
        verified: true,
      }),
      // pgvector accepts its text format "[a,b,c]" via PostgREST.
      embedding: JSON.stringify(values),
    });
    if ((i + 1) % 10 === 0 || i === FOODS.length - 1) console.log(`  embedded ${i + 1}/${FOODS.length}`);
  }

  // Idempotent re-seed: clear previous curated rows, then insert fresh.
  const del = await supabase.from("foods").delete().eq("source", "curated");
  if (del.error) {
    console.error("Delete failed:", del.error.message);
    process.exit(1);
  }

  // Insert in chunks to keep payloads reasonable.
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const ins = await supabase.from("foods").insert(chunk);
    if (ins.error) {
      console.error("Insert failed:", ins.error.message);
      process.exit(1);
    }
  }

  const { count } = await supabase
    .from("foods")
    .select("id", { count: "exact", head: true })
    .not("embedding", "is", null);
  console.log(`✅ Done. foods rows with embeddings: ${count}`);
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
