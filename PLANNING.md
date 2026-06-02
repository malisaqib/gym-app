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
- Phase 8 — Relatable goal-based onboarding (see Core product direction below).
- Phase 9 — "What should I eat next?" AI meal coach (see below).

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
