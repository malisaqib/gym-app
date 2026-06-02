# Project: Desi Fitness Coach (working name)

## What this is
A PWA (mobile-first, installable web app) that helps fitness beginners. It removes the two biggest beginner pains: "I don't know what to do" and "logging food is too tedious." The app works for ANY user and ANY cuisine (western or South Asian), but its focus, accuracy edge, and positioning are desi-first: it understands Pakistani/South Asian food and portions (roti, pyali, gravies, ghee) better than western apps do, and offers an optional Roman Urdu/Urdu mode. Western food and English are fully supported by default.

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

## Important
- Explain what you're doing as you go; I want to understand every piece, not just run it.
- Make one phase work end-to-end (even if ugly) before polishing anything.
- Ask me before adding any new dependency or service.
