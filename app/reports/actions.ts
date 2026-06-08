"use server";

import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/analytics";
import type {
  FoodReportEstimate,
  ReportContext,
  ReportType,
} from "@/lib/database.types";

/**
 * Food reports (Phase 1) — persist a user's "missing / incorrect food" report.
 *
 * SERVER ONLY. Writes one row to public.food_reports (RLS-scoped to the user).
 * This is INDEPENDENT of logging: a report failing must never block the user
 * from logging an estimate, and a report must NEVER be silently dropped — on
 * failure we return the error so the UI can surface it.
 *
 * The food RAG pipeline and auth are untouched; this only inserts a report row.
 */

const REPORT_TYPES: ReportType[] = ["missing", "incorrect"];
const CONTEXTS: ReportContext[] = ["home_log", "plan_add", "plan_swap", "edit", "coach_estimate"];

export interface SubmitFoodReportInput {
  reportedText: string;
  reportType: ReportType;
  context: ReportContext;
  matchedFoodId?: string | null;
  userNote?: string | null;
  // Rough numbers the user offers — both optional, clamped to sane bounds.
  userEstimate?: FoodReportEstimate | null;
}

type SubmitResult = { ok: true; id: string } | { ok: false; error: string };

// Coerce one optional estimate field into a clean integer within a sane bound,
// or undefined if the user left it blank / typed junk. (Never trust UI input.)
function cleanEstimateField(v: unknown, max: number): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(n, max);
}

export async function submitFoodReport(input: SubmitFoodReportInput): Promise<SubmitResult> {
  const reportedText = input.reportedText?.trim();
  if (!reportedText) return { ok: false, error: "Tell us which food, first." };

  if (!REPORT_TYPES.includes(input.reportType)) {
    return { ok: false, error: "Unknown report type." };
  }
  if (!CONTEXTS.includes(input.context)) {
    return { ok: false, error: "Unknown report context." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Build the optional estimate JSON, only including fields the user actually
  // gave. Null (not {}) when nothing was entered, so the column stays clean.
  const calories = cleanEstimateField(input.userEstimate?.calories, 10000);
  const protein = cleanEstimateField(input.userEstimate?.protein, 2000);
  const estimate: FoodReportEstimate = {};
  if (calories !== undefined) estimate.calories = calories;
  if (protein !== undefined) estimate.protein = protein;
  const userEstimate = Object.keys(estimate).length > 0 ? estimate : null;

  const note = input.userNote?.trim();

  const { data, error } = await supabase
    .from("food_reports")
    .insert({
      user_id: user.id,
      reported_text: reportedText.slice(0, 500),
      report_type: input.reportType,
      context: input.context,
      matched_food_id: input.matchedFoodId?.trim() || null,
      user_note: note ? note.slice(0, 1000) : null,
      user_estimate: userEstimate,
      // status defaults to 'new' in the DB.
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { ok: false, error: error.message };

  // Best-effort analytics — must never block or fail the report.
  await logEvent(supabase, user.id, "food_reported", {
    report_type: input.reportType,
    context: input.context,
  });

  return { ok: true, id: data.id };
}

// -----------------------------------------------------------------------------
// FUTURE — admin review (NOT built yet).
//
// For now you review reports directly in the Supabase dashboard (Table editor /
// SQL), where the service role bypasses RLS. When we're ready to build an
// in-app review screen, it plugs in HERE:
//   1. A protected route group `app/admin/food-reports/page.tsx` (gate on an
//      admin allow-list / a profiles.is_admin flag — add that check first).
//   2. A read action like `listFoodReports({ status })` that, because RLS scopes
//      every user to their OWN rows, must use a SERVICE-ROLE client (server-only,
//      key never exposed) to read across all users.
//   3. An `updateReportStatus(id, status)` action ('new'→'reviewed'/'added'/
//      'dismissed') — also service-role + admin-gated.
// Until that exists, do NOT add a read path here (it would either be empty under
// RLS or unsafe without the admin gate).
// -----------------------------------------------------------------------------
