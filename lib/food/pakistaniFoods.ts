/**
 * Phase 4 — Curated Pakistani / South Asian food reference table.
 *
 * This is the "grounding" data we feed to the LLM so it estimates common desi
 * dishes accurately instead of guessing. Values are per the stated portion and
 * are CURATED ESTIMATES — refine them over time as you learn what's accurate.
 *
 * Important: this table grounds desi foods only. Western / other foods are NOT
 * in here on purpose — the LLM handles those from its general knowledge. The
 * parser must never assume the user's input is desi.
 *
 * `aliases` (incl. Roman Urdu spellings) help the model match what users type.
 */
export interface PakistaniFood {
  name: string; // canonical English name
  aliases: string[]; // common / Roman Urdu names for matching
  portion: string; // the portion the macros below describe
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export const PAKISTANI_FOODS: PakistaniFood[] = [
  // --- breads ---
  { name: "Roti / chapati", aliases: ["roti", "chapati", "phulka"], portion: "1 medium (~45g)", calories: 110, protein_g: 3, carbs_g: 22, fat_g: 2 },
  { name: "Naan", aliases: ["naan"], portion: "1 plain (~90g)", calories: 260, protein_g: 9, carbs_g: 50, fat_g: 5 },
  { name: "Paratha", aliases: ["paratha", "parantha"], portion: "1 plain (~60g)", calories: 280, protein_g: 5, carbs_g: 36, fat_g: 13 },

  // --- rice ---
  { name: "Boiled rice", aliases: ["chawal", "rice", "plain rice", "boiled rice"], portion: "1 katori (~150g cooked)", calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1 },
  { name: "Chicken biryani", aliases: ["biryani", "chicken biryani", "biriyani"], portion: "1 plate (~350g)", calories: 550, protein_g: 22, carbs_g: 65, fat_g: 22 },
  { name: "Pulao", aliases: ["pulao", "pilau", "chicken pulao", "yakhni pulao"], portion: "1 plate (~300g)", calories: 450, protein_g: 18, carbs_g: 58, fat_g: 15 },

  // --- daals & vegetarian curries ---
  { name: "Daal (lentils)", aliases: ["daal", "dal", "masoor", "moong", "maash", "lentils"], portion: "1 katori / pyali (~200g)", calories: 150, protein_g: 9, carbs_g: 22, fat_g: 3 },
  { name: "Chana / chickpea curry", aliases: ["chana", "cholay", "chole", "chickpea"], portion: "1 katori (~200g)", calories: 190, protein_g: 9, carbs_g: 27, fat_g: 5 },
  { name: "Palak / saag", aliases: ["palak", "saag", "spinach"], portion: "1 katori (~200g)", calories: 180, protein_g: 6, carbs_g: 12, fat_g: 12 },
  { name: "Aloo curry", aliases: ["aloo", "potato curry", "aloo ki sabzi"], portion: "1 katori (~200g)", calories: 200, protein_g: 4, carbs_g: 28, fat_g: 9 },

  // --- meat curries ---
  { name: "Chicken karahi", aliases: ["karahi", "kadai", "chicken karahi"], portion: "1 serving (~250g)", calories: 400, protein_g: 35, carbs_g: 8, fat_g: 26 },
  { name: "Chicken curry / salan", aliases: ["chicken salan", "chicken curry", "shorba", "salan"], portion: "1 serving (~200g)", calories: 300, protein_g: 28, carbs_g: 8, fat_g: 18 },
  { name: "Qeema (minced meat)", aliases: ["qeema", "keema", "mince"], portion: "1 katori (~150g)", calories: 350, protein_g: 22, carbs_g: 5, fat_g: 26 },
  { name: "Aloo gosht", aliases: ["aloo gosht", "mutton curry", "beef curry"], portion: "1 serving (~250g)", calories: 360, protein_g: 24, carbs_g: 12, fat_g: 22 },
  { name: "Nihari", aliases: ["nihari"], portion: "1 bowl (~250g)", calories: 450, protein_g: 28, carbs_g: 10, fat_g: 33 },
  { name: "Haleem", aliases: ["haleem", "daleem"], portion: "1 bowl (~250g)", calories: 300, protein_g: 18, carbs_g: 28, fat_g: 13 },

  // --- kababs & grilled ---
  { name: "Seekh kabab", aliases: ["seekh kabab", "seekh kebab"], portion: "1 kabab (~60g)", calories: 120, protein_g: 9, carbs_g: 2, fat_g: 8 },
  { name: "Chapli kabab", aliases: ["chapli kabab", "chapli kebab"], portion: "1 kabab (~100g)", calories: 250, protein_g: 14, carbs_g: 6, fat_g: 18 },
  { name: "Chicken tikka", aliases: ["tikka", "chicken tikka"], portion: "1 piece (leg, ~120g)", calories: 180, protein_g: 22, carbs_g: 2, fat_g: 9 },
  { name: "Shami kabab", aliases: ["shami kabab", "shami"], portion: "1 kabab (~50g)", calories: 100, protein_g: 6, carbs_g: 5, fat_g: 6 },

  // --- dairy & drinks ---
  { name: "Dahi (plain yogurt)", aliases: ["dahi", "yogurt", "curd"], portion: "1 katori (~150g)", calories: 90, protein_g: 5, carbs_g: 8, fat_g: 4 },
  { name: "Raita", aliases: ["raita"], portion: "1 katori (~150g)", calories: 90, protein_g: 4, carbs_g: 8, fat_g: 4 },
  { name: "Sweet lassi", aliases: ["lassi", "sweet lassi"], portion: "1 glass (~250ml)", calories: 180, protein_g: 6, carbs_g: 28, fat_g: 5 },
  { name: "Milk (full cream)", aliases: ["milk", "doodh"], portion: "1 cup (~250ml)", calories: 150, protein_g: 8, carbs_g: 12, fat_g: 8 },
  { name: "Chai (milk tea, sugar)", aliases: ["chai", "tea", "doodh patti"], portion: "1 cup (~150ml)", calories: 120, protein_g: 3, carbs_g: 18, fat_g: 4 },

  // --- snacks & sweets ---
  { name: "Samosa", aliases: ["samosa", "samosay"], portion: "1 (~60g)", calories: 150, protein_g: 3, carbs_g: 17, fat_g: 8 },
  { name: "Pakora", aliases: ["pakora", "pakoray", "bhajia"], portion: "1 plate (~100g)", calories: 300, protein_g: 8, carbs_g: 28, fat_g: 18 },
  { name: "Kheer", aliases: ["kheer", "rice pudding"], portion: "1 katori (~150g)", calories: 250, protein_g: 6, carbs_g: 40, fat_g: 8 },
  { name: "Gulab jamun", aliases: ["gulab jamun", "gulab jaman"], portion: "1 piece", calories: 150, protein_g: 2, carbs_g: 25, fat_g: 5 },
  { name: "Jalebi", aliases: ["jalebi"], portion: "1 piece (~30g)", calories: 150, protein_g: 1, carbs_g: 25, fat_g: 5 },

  // --- common staples / eggs ---
  { name: "Egg (boiled/fried)", aliases: ["anda", "egg", "boiled egg", "fried egg"], portion: "1 egg", calories: 80, protein_g: 6, carbs_g: 1, fat_g: 5 },
  { name: "Omelette (2 eggs)", aliases: ["omelette", "omelet", "anda omelette"], portion: "2 eggs", calories: 200, protein_g: 12, carbs_g: 2, fat_g: 16 },
  { name: "Chicken breast (cooked)", aliases: ["chicken breast", "grilled chicken"], portion: "100g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4 },
  { name: "White bread", aliases: ["bread", "double roti", "bread slice"], portion: "1 slice", calories: 70, protein_g: 2, carbs_g: 13, fat_g: 1 },
];

/**
 * Render the table as a compact text block for the LLM prompt. Kept small so it
 * doesn't bloat the request. The model uses these numbers when an item matches.
 */
export function formatFoodTableForPrompt(): string {
  return PAKISTANI_FOODS.map((f) => {
    const names = [f.name, ...f.aliases].join(", ");
    return `- ${names} | ${f.portion} = ${f.calories} kcal, ${f.protein_g}g protein, ${f.carbs_g}g carbs, ${f.fat_g}g fat`;
  }).join("\n");
}
