# Phase 4 Proposal — Open Food Facts (barcode / packaged foods)

> **Status: PROPOSAL ONLY. No code written. Do not build until approved.**

## Goal & non-goal
- **Goal:** let users **search/log packaged foods by barcode** (and brand/name), using Open Food Facts (OFF) as the data source for packaged/branded products.
- **Non-goal:** OFF data must **never auto-enter the diet-plan pool**. It is logging-only unless a specific row is later promoted by the classifier **and** human review.

## Why OFF fits our layered model cleanly
The `0018` schema already gives us everything OFF needs, so keeping it out of plans is automatic:

| OFF field | Our column |
|---|---|
| (constant) | `source = 'openfoodfacts'` |
| brands | `brand` |
| code | `barcode`, `source_id` |
| product_name + brand | `name` |
| energy-kcal_100g / proteins_100g / … | `calories_per_100g`, `protein_g_per_100g`, … |
| serving_size / serving_quantity | `serving_name`, `serving_grams`, `*_per_serving` |
| — | `verified = false`, `plan_eligible = false`, `classification_status = 'unclassified'` |

Because `plan_eligible` defaults **false**, `getMealPool` never pulls OFF rows into a plan — **no extra guard needed**. OFF rows are still loggable because logging/search uses the full table.

## Barcode scan flow (UX)
1. Add a **"Scan barcode"** action on the log screen.
2. Camera scan via the built-in **`BarcodeDetector`** Web API where available (Chrome/Android), with a **manual barcode-entry** fallback everywhere else.
3. Scan → `lookupBarcode(code)` server action → returns a loggable food (cache hit, fresh OFF fetch, or "not found → estimate/report").

## Live lookup vs bulk import — recommend **cache-on-read** (no bulk import)
OFF is ~3M products / multi-GB dumps. Bulk import would bloat the DB, pollute search, and is mostly irrelevant to our users.

**Recommended:** live lookup + cache-on-read:
1. `lookupBarcode(code)` → first check local `foods WHERE barcode = code` (cache hit returns instantly).
2. Miss → fetch `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`, parse nutrition.
3. Cache into `foods` (`source='openfoodfacts'`, `verified=false`, `plan_eligible=false`, barcode/brand/per-100g/per-serving) → next lookup is instant and it's now searchable by name/brand.

This grows the DB **organically** with only products users actually scan — high signal, minimal bloat, stays within OFF's fair-use limits.

## Missing / low-quality nutrition (OFF is crowd-sourced)
- Require at least **energy (kcal) + the 3 macros** to cache+log. If missing → fall back to the **existing LLM estimate flow** (`source='user_estimate'`) and offer **report-missing**.
- If only per-100g present → compute per-serving from `serving_size`; if neither, default 100 g.
- Use OFF's `completeness`/`nutrition_data` signal → label **"Partial/Estimated"**, never auto-verify.

## Keeping OFF out of the plan pool (defense in depth)
1. `plan_eligible=false` by default → excluded from `getMealPool`.
2. The runtime classifier (if ever run on OFF) hits `BRANDED_OR_RESTAURANT` / `ABSOLUTE_EXCLUDE` for most packaged items → excluded anyway.
3. Only a human review can flip a specific whole-food OFF item to `reviewed_eligible`.

## Attribution / license (must comply)
- OFF data: **Open Database License (ODbL)**; images: CC-BY-SA.
- We must: **attribute** ("Nutrition data from Open Food Facts — ODbL") in the UI/about; not relicense; keep share-alike **if** we ever publicly distribute a derived DB (caching for app use is fine).
- Set a descriptive **User-Agent** on API calls (OFF policy: identify app + contact).

## Suggested sub-phases (if approved)
- **4a** — `lookupBarcode` server action + cache-on-read + **manual barcode entry** + attribution. *No new dependency* (uses `fetch`). Reuses the existing search/log UI + badges.
- **4b** — camera scanning via `BarcodeDetector` (progressive enhancement; manual fallback). A scanner polyfill lib for unsupported browsers would be a **new dependency → ask first**.
- **4c** — completeness/partial-data UX polish.

## New dependencies / services — needs your approval
- **OFF API** = new external service (free, ODbL) → **ask**.
- **4a** needs no npm dependency. A barcode-scanner lib (4b fallback) **would** be new → **ask**.

## Risks
- OFF coverage is strong for Western packaged goods, **thinner for local Pakistani brands**.
- Crowd-sourced accuracy → always **loggable-but-unverified**, never plan-eligible, never auto-trusted.
- Privacy: scanned barcodes are sent to OFF (third party) — note in the privacy copy.

## Recommendation
Approve **4a first** (manual barcode + cache-on-read + attribution): smallest surface, **no new deps**, immediately useful, and fully consistent with the layered model. Defer camera scanning (4b) until 4a is proven.
