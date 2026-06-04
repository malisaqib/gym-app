export interface DesiFoodEstimate {
  name: string;
  aliases: string[];
  serving: string;
  caloriesMin: number;
  caloriesMax: number;
  proteinMin: number;
  proteinMax: number;
  carbs: "low" | "moderate" | "high";
  fats: "low" | "moderate" | "high";
  category:
    | "bread"
    | "rice"
    | "protein"
    | "curry"
    | "dairy"
    | "snack"
    | "drink"
    | "fruit"
    | "staple";
  notes: string;
  betterChoiceSuggestion: string;
  budgetFriendly?: boolean;
  fatLossFriendly?: boolean;
  muscleGainFriendly?: boolean;
}

export interface MatchedDesiFood {
  food: DesiFoodEstimate;
  quantity: number;
  matchedAlias: string;
  caloriesMin: number;
  caloriesMax: number;
  proteinMin: number;
  proteinMax: number;
}

export interface DesiMealEstimate {
  input: string;
  matches: MatchedDesiFood[];
  caloriesMin: number;
  caloriesMax: number;
  proteinMin: number;
  proteinMax: number;
  summary: string;
  goalFit: string;
  suggestion: string;
}

export interface EatNextAdvice {
  best: string;
  okay: string;
  limit: string;
  portion: string;
  reason: string;
  nextAction: string;
  matches: MatchedDesiFood[];
}

export const DESI_FOODS: DesiFoodEstimate[] = [
  {
    name: "Roti",
    aliases: ["roti", "chapati", "phulka"],
    serving: "1 medium",
    caloriesMin: 90,
    caloriesMax: 130,
    proteinMin: 3,
    proteinMax: 4,
    carbs: "high",
    fats: "low",
    category: "bread",
    notes: "Simple carb source. Fine in a plan when portions are controlled.",
    betterChoiceSuggestion: "Pair it with eggs, daal, chicken, yogurt, or chana instead of eating it alone.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Naan",
    aliases: ["naan", "plain naan"],
    serving: "1 plain naan",
    caloriesMin: 240,
    caloriesMax: 330,
    proteinMin: 7,
    proteinMax: 10,
    carbs: "high",
    fats: "moderate",
    category: "bread",
    notes: "Usually larger and denser than roti.",
    betterChoiceSuggestion: "For fat loss, take half naan or swap to roti when possible.",
    muscleGainFriendly: true,
  },
  {
    name: "Paratha",
    aliases: ["paratha", "parantha", "anda paratha"],
    serving: "1 medium",
    caloriesMin: 250,
    caloriesMax: 380,
    proteinMin: 5,
    proteinMax: 10,
    carbs: "high",
    fats: "high",
    category: "bread",
    notes: "Calories change a lot based on oil or ghee.",
    betterChoiceSuggestion: "Use less oil and add eggs or yogurt so it becomes more filling.",
    budgetFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Egg",
    aliases: ["anda", "egg", "boiled egg", "fried egg", "anday"],
    serving: "1 egg",
    caloriesMin: 70,
    caloriesMax: 90,
    proteinMin: 6,
    proteinMax: 7,
    carbs: "low",
    fats: "moderate",
    category: "protein",
    notes: "One of the easiest budget proteins.",
    betterChoiceSuggestion: "Boiled or low-oil omelette is usually the best version.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Omelette",
    aliases: ["omelette", "omelet", "anda omelette", "anda omelet"],
    serving: "2 eggs",
    caloriesMin: 180,
    caloriesMax: 280,
    proteinMin: 12,
    proteinMax: 16,
    carbs: "low",
    fats: "high",
    category: "protein",
    notes: "Oil and cheese can push calories up.",
    betterChoiceSuggestion: "Cook with less oil and add tomatoes, onions, or green chilli.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Daal",
    aliases: ["daal", "dal", "lentils", "masoor", "moong", "maash"],
    serving: "1 katori",
    caloriesMin: 130,
    caloriesMax: 220,
    proteinMin: 7,
    proteinMax: 12,
    carbs: "moderate",
    fats: "moderate",
    category: "curry",
    notes: "Good budget food, but protein is moderate rather than very high.",
    betterChoiceSuggestion: "Add yogurt, eggs, chicken, or chana if you need more protein.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Daal chawal",
    aliases: ["daal chawal", "dal chawal", "rice and daal", "daal rice"],
    serving: "1 medium plate",
    caloriesMin: 430,
    caloriesMax: 650,
    proteinMin: 12,
    proteinMax: 20,
    carbs: "high",
    fats: "moderate",
    category: "rice",
    notes: "Repeatable and budget friendly, but easy to overdo rice.",
    betterChoiceSuggestion: "Take more daal, less rice, and add raita or salad.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "White rice",
    aliases: ["white rice", "boiled rice", "plain rice", "chawal"],
    serving: "1 katori cooked",
    caloriesMin: 180,
    caloriesMax: 240,
    proteinMin: 3,
    proteinMax: 5,
    carbs: "high",
    fats: "low",
    category: "rice",
    notes: "Mostly carbs. Not bad, just portion sensitive.",
    betterChoiceSuggestion: "Use it with daal, chicken, chana, or yogurt instead of eating a large plain plate.",
    budgetFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Chicken biryani",
    aliases: ["biryani", "chicken biryani", "biriyani"],
    serving: "1 medium plate",
    caloriesMin: 700,
    caloriesMax: 1000,
    proteinMin: 20,
    proteinMax: 35,
    carbs: "high",
    fats: "high",
    category: "rice",
    notes: "Usually high in oil and rice, with moderate protein.",
    betterChoiceSuggestion: "For fat loss, take half plate and add raita, salad, or extra chicken if available.",
    muscleGainFriendly: true,
  },
  {
    name: "Pulao",
    aliases: ["pulao", "pilau", "chicken pulao", "yakhni pulao"],
    serving: "1 medium plate",
    caloriesMin: 550,
    caloriesMax: 800,
    proteinMin: 15,
    proteinMax: 28,
    carbs: "high",
    fats: "moderate",
    category: "rice",
    notes: "Often lighter than biryani, but still rice-heavy.",
    betterChoiceSuggestion: "Keep the plate moderate and add yogurt or salad.",
    muscleGainFriendly: true,
  },
  {
    name: "Chicken salan",
    aliases: ["chicken salan", "chicken curry", "murghi salan", "chicken shorba"],
    serving: "1 serving",
    caloriesMin: 260,
    caloriesMax: 450,
    proteinMin: 22,
    proteinMax: 35,
    carbs: "low",
    fats: "high",
    category: "curry",
    notes: "Good protein, but oil can change calories a lot.",
    betterChoiceSuggestion: "Take more chicken pieces and less oily gravy.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Chicken karahi",
    aliases: ["chicken karahi", "karahi", "kadai chicken"],
    serving: "1 serving",
    caloriesMin: 420,
    caloriesMax: 700,
    proteinMin: 30,
    proteinMax: 45,
    carbs: "low",
    fats: "high",
    category: "curry",
    notes: "High protein but often high oil.",
    betterChoiceSuggestion: "Use 1 roti instead of naan and avoid extra oily gravy.",
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Chicken tikka",
    aliases: ["chicken tikka", "tikka", "grilled chicken"],
    serving: "1 piece",
    caloriesMin: 180,
    caloriesMax: 300,
    proteinMin: 22,
    proteinMax: 35,
    carbs: "low",
    fats: "moderate",
    category: "protein",
    notes: "One of the better outside-food options.",
    betterChoiceSuggestion: "Add salad or raita. Keep naan/roti controlled.",
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Beef or mutton karahi",
    aliases: ["beef karahi", "mutton karahi", "gosht karahi"],
    serving: "1 serving",
    caloriesMin: 550,
    caloriesMax: 900,
    proteinMin: 25,
    proteinMax: 45,
    carbs: "low",
    fats: "high",
    category: "curry",
    notes: "Protein is good, but fats and oil are usually high.",
    betterChoiceSuggestion: "Keep portion moderate, take lean pieces, and limit naan.",
    muscleGainFriendly: true,
  },
  {
    name: "Nihari",
    aliases: ["nihari"],
    serving: "1 bowl",
    caloriesMin: 500,
    caloriesMax: 850,
    proteinMin: 22,
    proteinMax: 40,
    carbs: "moderate",
    fats: "high",
    category: "curry",
    notes: "Can be very calorie dense, especially with naan.",
    betterChoiceSuggestion: "Take a smaller bowl, skim visible oil, and pair with half naan or one roti.",
    muscleGainFriendly: true,
  },
  {
    name: "Haleem",
    aliases: ["haleem", "daleem"],
    serving: "1 bowl",
    caloriesMin: 350,
    caloriesMax: 600,
    proteinMin: 16,
    proteinMax: 28,
    carbs: "moderate",
    fats: "moderate",
    category: "curry",
    notes: "Balanced compared with many fried foods, but toppings add calories.",
    betterChoiceSuggestion: "Go easy on fried onions and oil topping.",
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Chana or cholay",
    aliases: ["chana", "cholay", "chole", "chickpeas"],
    serving: "1 katori",
    caloriesMin: 180,
    caloriesMax: 300,
    proteinMin: 8,
    proteinMax: 14,
    carbs: "moderate",
    fats: "moderate",
    category: "staple",
    notes: "Great budget food and filling.",
    betterChoiceSuggestion: "Pair with roti and yogurt for a simple repeatable meal.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Samosa",
    aliases: ["samosa", "samosay"],
    serving: "1 piece",
    caloriesMin: 140,
    caloriesMax: 230,
    proteinMin: 2,
    proteinMax: 5,
    carbs: "moderate",
    fats: "high",
    category: "snack",
    notes: "Tasty, but fried and not very filling for the calories.",
    betterChoiceSuggestion: "Have one, not three, and add chai without extra sugar or a protein food later.",
  },
  {
    name: "Pakora",
    aliases: ["pakora", "pakoray", "bhajia"],
    serving: "1 small plate",
    caloriesMin: 250,
    caloriesMax: 450,
    proteinMin: 5,
    proteinMax: 10,
    carbs: "moderate",
    fats: "high",
    category: "snack",
    notes: "Fried snack. Calories rise fast with portion size.",
    betterChoiceSuggestion: "Keep it as a small side, not the full meal.",
  },
  {
    name: "Fries",
    aliases: ["fries", "chips", "french fries"],
    serving: "1 medium serving",
    caloriesMin: 300,
    caloriesMax: 550,
    proteinMin: 3,
    proteinMax: 7,
    carbs: "high",
    fats: "high",
    category: "snack",
    notes: "High calorie and low protein.",
    betterChoiceSuggestion: "Split it or replace with chicken, eggs, or yogurt when you need results.",
  },
  {
    name: "Zinger burger",
    aliases: ["zinger", "zinger burger", "crispy burger"],
    serving: "1 burger",
    caloriesMin: 550,
    caloriesMax: 850,
    proteinMin: 20,
    proteinMax: 35,
    carbs: "high",
    fats: "high",
    category: "snack",
    notes: "Has protein, but fried chicken, mayo, and bun make it calorie dense.",
    betterChoiceSuggestion: "Choose grilled if available, skip fries, or keep it as an occasional meal.",
    muscleGainFriendly: true,
  },
  {
    name: "Shawarma",
    aliases: ["shawarma", "chicken shawarma"],
    serving: "1 regular",
    caloriesMin: 400,
    caloriesMax: 700,
    proteinMin: 20,
    proteinMax: 35,
    carbs: "moderate",
    fats: "moderate",
    category: "snack",
    notes: "Can be a decent outside option if sauces are controlled.",
    betterChoiceSuggestion: "Ask for less mayo and extra chicken or salad.",
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Chai with sugar",
    aliases: ["chai", "tea", "milk tea"],
    serving: "1 cup",
    caloriesMin: 80,
    caloriesMax: 160,
    proteinMin: 2,
    proteinMax: 4,
    carbs: "moderate",
    fats: "moderate",
    category: "drink",
    notes: "Small cup is fine, repeated sugar adds up.",
    betterChoiceSuggestion: "Reduce sugar gradually or keep it to one cup when cutting.",
    budgetFriendly: true,
  },
  {
    name: "Doodh patti",
    aliases: ["doodh patti", "dudh patti"],
    serving: "1 cup",
    caloriesMin: 120,
    caloriesMax: 220,
    proteinMin: 4,
    proteinMax: 8,
    carbs: "moderate",
    fats: "moderate",
    category: "drink",
    notes: "More milk means more calories and some protein.",
    betterChoiceSuggestion: "Use less sugar if fat loss is the goal.",
    budgetFriendly: true,
  },
  {
    name: "Sweet lassi",
    aliases: ["lassi", "sweet lassi"],
    serving: "1 glass",
    caloriesMin: 220,
    caloriesMax: 420,
    proteinMin: 6,
    proteinMax: 12,
    carbs: "high",
    fats: "moderate",
    category: "drink",
    notes: "Can be filling, but sugar makes calories jump.",
    betterChoiceSuggestion: "Choose unsweetened yogurt or raita for fat loss.",
    muscleGainFriendly: true,
  },
  {
    name: "Yogurt or raita",
    aliases: ["yogurt", "dahi", "raita", "curd"],
    serving: "1 katori",
    caloriesMin: 80,
    caloriesMax: 160,
    proteinMin: 5,
    proteinMax: 10,
    carbs: "moderate",
    fats: "moderate",
    category: "dairy",
    notes: "Good side for fullness, digestion, and protein.",
    betterChoiceSuggestion: "Use it with biryani, pulao, daal chawal, or roti meals.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Banana",
    aliases: ["banana", "kela", "kayla"],
    serving: "1 medium",
    caloriesMin: 90,
    caloriesMax: 130,
    proteinMin: 1,
    proteinMax: 2,
    carbs: "high",
    fats: "low",
    category: "fruit",
    notes: "Easy pre-workout carb, not a protein source.",
    betterChoiceSuggestion: "Pair with milk, yogurt, eggs, or a protein shake.",
    budgetFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Apple",
    aliases: ["apple", "saib"],
    serving: "1 medium",
    caloriesMin: 70,
    caloriesMax: 110,
    proteinMin: 0,
    proteinMax: 1,
    carbs: "moderate",
    fats: "low",
    category: "fruit",
    notes: "Low calorie snack, but not protein.",
    betterChoiceSuggestion: "Good snack if you already have protein covered.",
    fatLossFriendly: true,
  },
  {
    name: "Milk",
    aliases: ["milk", "doodh"],
    serving: "1 glass",
    caloriesMin: 120,
    caloriesMax: 220,
    proteinMin: 7,
    proteinMax: 10,
    carbs: "moderate",
    fats: "moderate",
    category: "dairy",
    notes: "Useful budget calories and protein.",
    betterChoiceSuggestion: "For fat loss, keep portion measured. For muscle gain, it is an easy add-on.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Oats",
    aliases: ["oats", "oatmeal", "daliya"],
    serving: "1 bowl",
    caloriesMin: 250,
    caloriesMax: 400,
    proteinMin: 8,
    proteinMax: 16,
    carbs: "high",
    fats: "moderate",
    category: "staple",
    notes: "Good breakfast base, especially with milk.",
    betterChoiceSuggestion: "Add milk or yogurt for protein, keep sugar low.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Peanut butter",
    aliases: ["peanut butter", "peanut spread"],
    serving: "1 tablespoon",
    caloriesMin: 90,
    caloriesMax: 120,
    proteinMin: 3,
    proteinMax: 5,
    carbs: "low",
    fats: "high",
    category: "staple",
    notes: "Calorie dense. Helpful for bulking, easy to overeat when cutting.",
    betterChoiceSuggestion: "Measure one spoon instead of eating from the jar.",
    muscleGainFriendly: true,
  },
  {
    name: "Protein shake",
    aliases: ["protein shake", "whey", "whey protein"],
    serving: "1 scoop with water",
    caloriesMin: 110,
    caloriesMax: 160,
    proteinMin: 20,
    proteinMax: 28,
    carbs: "low",
    fats: "low",
    category: "protein",
    notes: "Convenient, but not required if you can hit protein with food.",
    betterChoiceSuggestion: "Use it to fill protein gaps, not as a full meal replacement every time.",
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Boiled potatoes",
    aliases: ["boiled potatoes", "boiled potato", "aloo ubla", "ubla aloo"],
    serving: "1 medium potato",
    caloriesMin: 110,
    caloriesMax: 170,
    proteinMin: 2,
    proteinMax: 4,
    carbs: "high",
    fats: "low",
    category: "staple",
    notes: "Filling carb source when not fried.",
    betterChoiceSuggestion: "Add eggs, yogurt, chicken, or chana for protein.",
    budgetFriendly: true,
    fatLossFriendly: true,
    muscleGainFriendly: true,
  },
  {
    name: "Salad",
    aliases: ["salad", "kachumber", "cucumber", "kheera"],
    serving: "1 bowl",
    caloriesMin: 20,
    caloriesMax: 80,
    proteinMin: 1,
    proteinMax: 3,
    carbs: "low",
    fats: "low",
    category: "staple",
    notes: "Low calorie volume. Helps meals feel bigger.",
    betterChoiceSuggestion: "Use it beside rice, karahi, biryani, or roti meals.",
    budgetFriendly: true,
    fatLossFriendly: true,
  },
];

const QUANTITY_WORDS: Record<string, number> = {
  ek: 1,
  aik: 1,
  one: 1,
  do: 2,
  two: 2,
  teen: 3,
  three: 3,
  char: 4,
  chaar: 4,
  four: 4,
  half: 0.5,
  adha: 0.5,
  aadha: 0.5,
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectQuantity(normalizedInput: string, alias: string): number {
  const index = normalizedInput.indexOf(alias);
  if (index <= 0) return 1;

  const before = normalizedInput.slice(Math.max(0, index - 32), index).trim();
  const tokens = before.split(/\s+/).filter(Boolean);
  const recent = tokens.slice(-3);

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const token = recent[i];
    const numeric = Number(token);
    if (Number.isFinite(numeric) && numeric > 0 && numeric <= 10) return numeric;
    if (QUANTITY_WORDS[token]) return QUANTITY_WORDS[token];
  }

  return 1;
}

function matchAlias(input: string, food: DesiFoodEstimate): string | null {
  const padded = ` ${input} `;
  const aliases = [...food.aliases].sort((a, b) => b.length - a.length);
  return aliases.find((alias) => padded.includes(` ${normalize(alias)} `)) ?? null;
}

export function findDesiFoodMatches(input: string): MatchedDesiFood[] {
  const normalizedInput = normalize(input);
  if (!normalizedInput) return [];

  let working = normalizedInput;
  const foods = [...DESI_FOODS].sort((a, b) => {
    const aMax = Math.max(...a.aliases.map((alias) => normalize(alias).length));
    const bMax = Math.max(...b.aliases.map((alias) => normalize(alias).length));
    return bMax - aMax;
  });

  const matches: MatchedDesiFood[] = [];

  for (const food of foods) {
    const alias = matchAlias(working, food);
    if (!alias) continue;

    const quantity = detectQuantity(normalizedInput, alias);
    matches.push({
      food,
      quantity,
      matchedAlias: alias,
      caloriesMin: Math.round(food.caloriesMin * quantity),
      caloriesMax: Math.round(food.caloriesMax * quantity),
      proteinMin: Math.round(food.proteinMin * quantity),
      proteinMax: Math.round(food.proteinMax * quantity),
    });

    for (const itemAlias of food.aliases) {
      const safeAlias = normalize(itemAlias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      working = working.replace(new RegExp(`(^| )${safeAlias}(?= |$)`, "g"), " ");
    }
    working = working.replace(/\s+/g, " ").trim();
  }

  return matches;
}

function hasFatLossGoal(goal?: string | null): boolean {
  const g = normalize(goal ?? "");
  return ["fat", "belly", "shirt", "wedding", "event", "summer", "lean", "confidence", "glow"].some((word) =>
    g.includes(word)
  );
}

function hasMuscleGoal(goal?: string | null): boolean {
  const g = normalize(goal ?? "");
  return ["muscle", "bulk", "strong", "strength", "arms", "chest", "shoulder", "football", "cricket"].some((word) =>
    g.includes(word)
  );
}

function buildGoalFit(matches: MatchedDesiFood[], personalGoal?: string | null): string {
  if (matches.length === 0) return "I could not match a known food yet, so treat this as a rough coaching estimate.";

  const proteinMax = matches.reduce((sum, match) => sum + match.proteinMax, 0);
  const caloriesMax = matches.reduce((sum, match) => sum + match.caloriesMax, 0);
  const hasFried = matches.some((match) => match.food.category === "snack" && match.food.fats === "high");
  const fatLoss = hasFatLossGoal(personalGoal);
  const muscle = hasMuscleGoal(personalGoal);

  if (fatLoss && caloriesMax > 750) {
    return "For fat loss or a leaner look, this can fit, but the portion needs control.";
  }
  if (fatLoss && proteinMax >= 20 && !hasFried) {
    return "Good fit for a leaner look because it has useful protein without going too heavy.";
  }
  if (muscle && proteinMax >= 25) {
    return "Good fit for muscle gain because the protein is solid.";
  }
  if (hasFried) {
    return "Okay sometimes, but fried foods are easy to overeat and do not keep protein high.";
  }
  return "This can fit a beginner plan if the portion is honest and you add protein where needed.";
}

export function estimateDesiMeal(input: string, personalGoal?: string | null): DesiMealEstimate {
  const matches = findDesiFoodMatches(input);
  const caloriesMin = matches.reduce((sum, match) => sum + match.caloriesMin, 0);
  const caloriesMax = matches.reduce((sum, match) => sum + match.caloriesMax, 0);
  const proteinMin = matches.reduce((sum, match) => sum + match.proteinMin, 0);
  const proteinMax = matches.reduce((sum, match) => sum + match.proteinMax, 0);
  const firstSuggestion = matches[0]?.food.betterChoiceSuggestion;

  return {
    input,
    matches,
    caloriesMin,
    caloriesMax,
    proteinMin,
    proteinMax,
    summary:
      matches.length > 0
        ? `Estimated ${caloriesMin}-${caloriesMax} kcal and ${proteinMin}-${proteinMax}g protein.`
        : "I could not find a close static match yet. Try words like roti, daal, biryani, chai, shawarma, or chicken.",
    goalFit: buildGoalFit(matches, personalGoal),
    suggestion:
      firstSuggestion ??
      "Use a simple plate check: protein first, then roti or rice, then salad or yogurt if available.",
  };
}

function scoreMatch(match: MatchedDesiFood, personalGoal?: string | null, budgetLabel?: string | null): number {
  let score = match.proteinMax * 4 - match.caloriesMax / 55;
  const food = match.food;

  if (food.fatLossFriendly && hasFatLossGoal(personalGoal)) score += 18;
  if (food.muscleGainFriendly && hasMuscleGoal(personalGoal)) score += 14;
  if (food.budgetFriendly && budgetLabel && !budgetLabel.includes("1000")) score += 10;
  if (food.category === "snack" && food.fats === "high") score -= 24;
  if (food.category === "drink" && food.carbs === "high") score -= 12;
  if (food.category === "protein") score += 12;
  if (food.category === "dairy") score += 6;
  if (food.name.toLowerCase().includes("biryani")) score -= hasFatLossGoal(personalGoal) ? 20 : 6;
  if (food.name.toLowerCase().includes("zinger")) score -= hasFatLossGoal(personalGoal) ? 22 : 8;

  return score;
}

export function adviseEatNext(input: {
  optionsText: string;
  personalGoal?: string | null;
  budgetLabel?: string | null;
}): EatNextAdvice {
  const matches = findDesiFoodMatches(input.optionsText);

  if (matches.length === 0) {
    return {
      best: "Choose the option with the clearest protein: eggs, chicken, daal, chana, yogurt, milk, or a protein shake.",
      okay: "Roti or rice can be okay if the portion is controlled.",
      limit: "Limit fried snacks, sugary drinks, and huge rice portions when you want visible progress.",
      portion: "Start with one palm-sized protein serving plus 1 roti or 1 small rice portion.",
      // Responsible-design: don't echo the raw (often appearance-based) goal —
      // keep guidance behaviour-based.
      reason: "Protein and a portion you can repeat matter most — start there.",
      nextAction: "Type the exact foods you have, like: 2 roti, daal, eggs, milk.",
      matches,
    };
  }

  const ranked = [...matches].sort(
    (a, b) => scoreMatch(b, input.personalGoal, input.budgetLabel) - scoreMatch(a, input.personalGoal, input.budgetLabel)
  );
  const best = ranked[0];
  const okay = ranked[1] ?? ranked[0];
  const limit = [...ranked].reverse()[0];
  const fatLoss = hasFatLossGoal(input.personalGoal);

  return {
    best: `${best.quantity > 1 ? `${best.quantity} x ` : ""}${best.food.name}`,
    okay: okay.food.name === best.food.name ? "A smaller portion of the same option is okay." : okay.food.name,
    limit:
      limit.food.name === best.food.name
        ? "Extra portions. Even good foods can slow progress when the serving doubles."
        : limit.food.name,
    portion: fatLoss
      ? "Keep carbs to 1 roti or half to one plate rice, then add salad or raita if available."
      : "Use a normal carb portion and add extra protein if you are still hungry.",
    reason: "The best choice has more protein, fewer calorie surprises, and a portion you can repeat.",
    nextAction: best.food.betterChoiceSuggestion,
    matches,
  };
}
