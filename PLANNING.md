# Build Plan — Desi Fitness Coach MVP

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

## Guiding principles
- Ruthless scope. Feature creep is the #1 risk.
- Food logging is the retention driver — over-invest there.
- Get the full loop working ugly before polishing.
- Build cuisine-agnostic; desi is the focus and accuracy edge, not a limitation. English is default; Roman Urdu/Urdu is an optional mode.
