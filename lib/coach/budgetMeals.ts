import type { BudgetProfile } from "@/app/coach/localCoachTypes";

// Repeatable, realistic desi meal ideas tuned to the user's budget + what they
// can actually buy. Framing is "realistic and repeatable", never restrictive,
// never good/bad-food language. Protein is shown as a friendly range.
export interface BudgetMeal {
  title: string;
  items: string;
  protein: string;
}

export function getBudgetMeals(profile: BudgetProfile): BudgetMeal[] {
  const { eggs, chicken, milkYogurt } = profile.foodSetup;
  const tier = profile.dailyBudget;
  const meals: BudgetMeal[] = [];

  if (eggs) {
    meals.push({
      title: "Egg + roti start",
      items: "2 eggs (boiled or low-oil), 1–2 roti, salad if you have it",
      protein: "~12–16g protein",
    });
  }
  if (milkYogurt) {
    meals.push({
      title: "Daal chawal + yogurt",
      items: "1 katori daal, a controlled portion of rice, 1 katori yogurt",
      protein: "~15–22g protein",
    });
  }
  if (chicken) {
    meals.push({
      title: "Chicken + roti",
      items: "Chicken salan pieces (go easy on oily gravy), 1–2 roti, salad",
      protein: "~25–35g protein",
    });
  }
  if (!eggs && !chicken && !milkYogurt) {
    meals.push({
      title: "Chana + roti",
      items: "1 katori chana/cholay, 1–2 roti, salad",
      protein: "~10–14g protein",
    });
  }

  // A cheap, always-doable anchor.
  meals.push({
    title: milkYogurt ? "Banana + milk" : "Banana + chana",
    items: milkYogurt ? "1 banana + 1 glass milk" : "1 banana + 1 katori chana",
    protein: milkYogurt ? "~8–10g protein" : "~9–13g protein",
  });

  // A little more room → an easy protein top-up on tight days.
  if (tier === "800" || tier === "1000_plus" || tier === "custom") {
    meals.push({
      title: "Protein top-up",
      items: "An extra egg, a bowl of yogurt, or one more chicken piece when protein is low",
      protein: "+6–25g protein",
    });
  }

  return meals.slice(0, 4);
}
