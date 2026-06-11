# Project: Zorfit

## What this is
A PWA (mobile-first, installable web app) that helps fitness beginners. It removes the two biggest beginner pains: "I don't know what to do" and "logging food is too tedious." The app is **bi-cuisine and balanced**: a US/Western user must get Western-accurate answers and a Pakistani user desi-accurate answers — neither is an afterthought. Accuracy is backed by real data, not LLM guessing: a retrieval (RAG) food knowledge base combining USDA FoodData Central (CC0) for Western/generic foods + a curated South Asian layer we own. Roman Urdu/Urdu is an optional mode; English is default. Understanding desi food/portions well is a differentiator, NOT a bias — the LLM must extract the right item from whichever cuisine the user means.

## Tech stack (do not deviate without asking me)
- Framework: Next.js (App Router) — frontend AND backend via API routes/route handlers
- Styling: Tailwind CSS
- Database + Auth: Supabase (Postgres + Supabase Auth)
- LLM (food parsing): Groq (Llama) — fast & cheap
- LLM (coaching bot): Gemini or Claude (quality over speed)
- Deploy: Vercel
- Language: TypeScript

## Conventions
- TypeScript everywhere, strict mode.
- Keep components small and readable. I'm learning from this code, so favor clarity over cleverness and add brief comments explaining non-obvious logic.
- All secrets in .env.local (never commit). Use NEXT_PUBLIC_ prefix only for safe client values.
- Calorie math lives in pure, testable functions — no AI for the math.
- Mobile-first responsive design always.

## Current phase
Phase 0 — Foundation. See PLANNING.md.

## Product voice
- The app is a friendly desi fitness coach — not a strict medical app or western bodybuilding tracker.
- Tone: friendly, simple, no shame, beginner-first, real Pakistani food examples, Roman Urdu supported.
- Onboarding uses relatable goals (wedding, look good in a shirt, belly fat, skinny→bulk, sports, confidence) mapped internally to a practical goal.
- An AI meal coach ("What should I eat next?") recommends meals from the user's remaining calories/protein + the options they have. Never invent exact nutrition — use ranges.
- LLM split: Groq (Llama) for high-frequency food parsing; the coaching/meal-advice LLM is the "quality" slot (Gemini/Claude per stack; currently runs on Groq until a Gemini key is wired).

## Important
- Explain what you're doing as you go; I want to understand every piece, not just run it.
- Make one phase work end-to-end (even if ugly) before polishing anything.
- Ask me before adding any new dependency or service.
