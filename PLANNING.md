# Build Plan — FitCoach MVP

## MVP scope (only these four things)
1. Onboarding chatbot → collects goal, age, weight, height, training days, experience → outputs daily calorie + protein target and a basic workout plan.
2. Food logging by plain text — user types "do roti, ek pyali daal" → LLM returns calories/macros → saved to day's log.
3. Daily dashboard — shows calories eaten vs target, protein eaten vs target, "how much left today."
4. Bodyweight tracking — log weight, see a progress chart.

## Explicitly NOT in MVP (do not build yet)
- Photo/camera food scanning
- GPS run/walk tracking
- Detailed micronutrients
- Payments / subscriptions
- Native app / Play Store

## Phases
- Phase 0 — Foundation: Next.js + Tailwind + Supabase auth (email login) + protected /dashboard, deployed to Vercel. A live URL where I can sign up and see an empty dashboard.
- Phase 1 — Data model: Supabase schema — profiles, food_logs, workouts, workout_logs, bodyweight_logs.
- Phase 2 — Calorie/macro engine: pure functions, Mifflin-St Jeor TDEE, targets by goal, with safety floors (no extreme deficits).
- Phase 3 — Onboarding bot: conversational flow (Roman Urdu option) → runs engine → saves targets.
- Phase 4 — Food logging (the core): user types a meal in plain language in ANY cuisine. An LLM parses it into structured macro JSON. Desi/South Asian foods are grounded by a curated Pakistani food table for accuracy; western and other foods rely on the LLM's general knowledge. Do NOT assume the input is desi — detect/handle both. One-tap correction, stored.
- Phase 5 — Workout module: A/B beginner split, exercise library w/ YouTube form links, log sets/reps, progression rules.
- Phase 6 — Bodyweight tracking + dashboard polish.
- Phase 7 — Beta with 20–30 real users; measure retention, fix drop-off.
- Phase 8 — Relatable goal-based onboarding (see Core product direction below).
- Phase 9 — "What should I eat next?" AI meal coach (see below).

## Nutrition & diet workstream (post-MVP, shipped)
A focused 5-phase pass on the numbers + meal planning. Architecture rule held
throughout: **all math and food selection is deterministic and unit-tested; AI
is only a layer on top for interpretation/phrasing/variety, never the source of
the numbers.** The food RAG pipeline (lib/food/*, lib/embeddings.ts, migrations
0005–0007) was not modified.

- **Calorie-engine fix** — TDEE now uses an honest WHOLE-DAY activity level
  (sedentary..extra), not training-day count (which double-counted activity and
  ran ~300–450 kcal high). Goal targets are fixed pace deltas (0.25 kg/wk = −250,
  0.5 = −500), capped at ≤0.75 kg/wk loss, with hard floors (1500 M / 1200 F).
  Pure + tested: `lib/nutrition/engine.ts`.
- **Target-weight goal setting** — onboarding/Settings collect goal weight +
  pace + activity; a deterministic planner derives direction, caps pace
  (≤0.75 kg/wk AND ≤1% bodyweight/wk loss; ≤0.5 gain), and outputs calories,
  macros (protein 1.6 g/kg, fat ~27.5%, rest carbs), and an estimated target
  date. `lib/nutrition/goalPlan.ts`.
- **Adaptive recalculation** — logging a weight recomputes targets from the new
  weight (flips to maintenance at goal); a deterministic plateau detector
  surfaces a supportive, non-shaming nudge on the Progress tab (AI only phrases
  it). `lib/nutrition/adapt.ts`, `lib/coach/adaptCoach.ts`.
- **Diet-plan generator** — a real generator (not hardcoded menus): splits the
  day across meals and greedily selects from an owned, annotated meal catalog to
  hit calories + protein while respecting prefs (veg / excluded foods / cuisine
  lean). Regenerate + swap; "Focus on habits" view; plans persist in Supabase.
  AI parses free-text prefs only (with a deterministic fallback).
  `lib/diet/{foodCatalog,planner}.ts`, `lib/coach/dietCoach.ts`, `app/diet/*`.

### Flagship Diet upgrade (Phases 0–5, shipped)
The Plan tab became the app's flagship feature via a 6-phase pass. Same rule:
deterministic + unit-tested math/selection (98 tests); AI only interprets
free-text and finds matching foods — it never invents foods/numbers or overrides
the calorie/protein targets. Food RAG pipeline, auth untouched; schema additive
only (`keep_foods`, migration 0014).

- **P0 Audit** — confirmed the avoid/veg filter IS applied at selection (the
  "veg still shows chicken" report didn't reproduce); surfaced the real defects.
- **P1 Hard filter + veg semantics** — `vegetarian` redefined as lacto-ovo
  (drops only meat/fish; egg/dairy/nuts are independent avoids). `matchesAvoidedFood`
  now word-boundary safe (a short term can't nuke unrelated foods). Plan shows an
  "out of date — Regenerate" cue when on-screen prefs differ from the built plan.
- **P2 "What you usually eat"** — a collapsible capture (chips + free text) for
  usual breakfast/lunch/dinner, go-to foods, and "rather not give up". Seeds the
  plan and PROTECTS keep foods (never swapped out). Deterministic, opt-in,
  non-shaming upgrade ideas (`lib/diet/upgrades.ts`) — never labels food bad/junk.
- **P3 Per-item editing** — each item has Swap (similar in-budget catalog food)
  and Remove (optimistic + rollback); each meal has Add (filter-aware dataset
  search, or free-typed → RAG/AI estimate flagged "≈ est"). Live totals; adds can
  go OVER target with a gentle, non-shaming note. Pure ops in `lib/diet/planner.ts`.
- **P4 Coverage** — catalog 41 → 71: veg protein (paneer/rajma/lobia/soya/tofu/
  chana chaat), desi staples (naan/nihari/haleem/pulao/kebabs/karahi/etc.),
  western/fast food, and coffee. Additive `aliases` (incl. Roman Urdu) wired into
  matching/search; macros web-checked.
- **P5 Polish** — all plan edits serialized via one `mutating` flag (concurrent
  writes can't silently overwrite); "Focus on habits" toggle shows active state;
  bigger mobile touch targets. Loading/empty/error states throughout.
- Files: `lib/diet/{foodCatalog,planner,upgrades}.ts`,
  `app/diet/{actions,page,DietPlanView,UsualEatingCard,AddFoodPanel}.tsx`.

### Migrations (run in Supabase SQL editor, in order) — all applied as of 2026-06-08
- `0009_goal_targets.sql` — goal/activity/macro columns + re-run-safe backfill.
- `0010_meal_plans.sql` — saved diet plans table.
- `0011_usual_eating.sql` — usual breakfast/lunch/dinner + likes/dislikes.
- `0012_coach_data.sql` — emotional_goal / budget_profile / check_ins jsonb on
  profiles (coach prefs moved off localStorage → Supabase, RLS-scoped,
  cross-device; the app one-time migrates any local data on first load).
  NOTE: the budget feature was later removed (it never fed the plan/coach), so
  `budget_profile` is now an unused column — harmless, left in place.
- `0013_training_setup.sql` — training_setup jsonb on profiles (the "Set up your
  training" inputs moved off localStorage → Supabase, read DB-first so the plan
  syncs across devices; one-time local→DB migration on first load).
- `0014_keep_foods.sql` — keep_foods text on profiles ("rather not give up"
  comfort foods; seeded + protected by the diet generator).
- `0015_food_quantity.sql` — live quantity/portion model on food_logs (per-unit
  `base_*` + `amount`; total = base × amount, old totals kept as a synced cache).
- `0016_food_reports.sql` — user-submitted "missing/incorrect food" reports
  (additive table, RLS-scoped to the user). See "Food reports" below.

### Food reports (missing / incorrect food) — shipped
Lets users flag a food that's missing from the dataset or whose matched
nutrition/name/portion is wrong, so we can later add/fix it. Stored data only —
NO notifications/queues; reviewed directly in the Supabase dashboard for now.
Architecture rules held: the food RAG pipeline and auth are untouched; schema is
additive only (`food_reports`, migration 0016). Reporting NEVER blocks logging,
and a report is never silently dropped (insert errors surface to the user).

- **Data** — `food_reports` (user_id, reported_text, report_type
  'missing'|'incorrect', context 'home_log'|'plan_add'|'plan_swap'|'edit',
  matched_food_id?, user_note?, user_estimate jsonb?, status default 'new').
  Types in `lib/database.types.ts`; server action `app/reports/actions.ts`
  (`submitFoodReport`, validated + clamped + best-effort analytics).
- **UI** — one shared bilingual bottom-sheet `components/ReportFoodSheet.tsx`
  (pre-filled food, optional note, optional rough calories/protein; loading/
  success/error states). Entry points: Home log no-match ("Can't find that?")
  and per-item ⚐ (`FoodLogger`); Plan add-search no-match and per-item ⚐
  (`AddFoodPanel`/`DietPlanView`). Estimated items report as 'missing'; existing
  catalog items as 'incorrect'.
- **Deferred** — a protected `/admin/food-reports` review screen (service-role +
  admin gate; plug-in point noted in `app/reports/actions.ts`), and an optional
  Coach-estimator trigger (would need a `coach_estimate` value added to the
  `context` enum + types).

### Deferred (flagged, not built)
- Budget-aware diet selection / "protein-per-rupee" (needs a food-cost layer; the
  budget capture UI was removed, so this would re-add a lightweight cost input).
- One-time "confirm your activity" prompt for existing users after the backfill.
- One-tap "apply" on the plateau nudge (currently advisory only).
- One-tap "apply" on a diet upgrade idea (currently advisory/dismissible; the
  per-item edit flow from P3 is where an "accept" would hook in).

## Core product direction
The app should feel like a friendly desi fitness coach — not a strict medical app
or a western bodybuilding tracker. Tone: friendly, simple, no shame, Roman Urdu
supported, practical Pakistani food examples, beginner-first.

### Feature A — "What should I eat next?" (AI meal coach)  → Phase 9
The user asks, in English or Roman Urdu, what to eat — typically giving the
options they have on hand. Examples:
- "What should I eat next?"
- "Mere paas anda, roti, daal, chawal, chicken hai. Kya khaon?"
- "Dinner mein kya khaon?"
- "I have 500 calories left and need protein."

The coach uses the user's REMAINING daily calories/protein (target minus what's
logged today) plus the options they typed to recommend the best meal.
Response always includes: (1) best option, (2) why, (3) what to avoid/reduce,
(4) approximate calories/protein (RANGES, never fake-precise), (5) one friendly
Roman Urdu coaching line.
Rules: don't invent exact nutrition; prefer high-protein when protein is low;
prefer lighter options when calories are nearly used up; if no targets yet, give
a general beginner-friendly suggestion; support English + Roman Urdu.

### Feature B — Relatable goal-based onboarding  → Phase 8
Onboarding asks RELATABLE goals (not just "lose weight"/"gain muscle") and maps
them internally to a practical goal for the engine:
- Wedding/event → short-term fat loss / recomposition
- Look good in a shirt → fat loss + upper-body focus
- Belly fat → fat loss (with honest note: spot reduction isn't possible)
- Skinny → healthy bulk → lean muscle gain
- Sports/championship → stamina + strength + performance
- General fitness/confidence → balanced plan
- "Gym start but confused" → balanced beginner plan
Flow (one question at a time, chatbot style): language → relatable goal →
timeline → age → gender → height → weight → training location → training days →
experience → food preference → foods they eat/avoid.
After onboarding, generate: calorie target, protein target, simple diet
guidance, a beginner workout pointer, and ONE relatable explanation connecting
the plan to their stated goal.

## Guiding principles
- Ruthless scope. Feature creep is the #1 risk.
- Food logging is the retention driver — over-invest there.
- Get the full loop working ugly before polishing.
- Build cuisine-agnostic; desi is the focus and accuracy edge, not a limitation. English is default; Roman Urdu/Urdu is an optional mode.
- Talk like a friendly desi coach: relatable goals, real Pakistani food, no shame, beginner-first.
