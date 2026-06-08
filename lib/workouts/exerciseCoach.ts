import { aiConfigError, aiHttpError } from "@/lib/ai/errors";

/**
 * Workout rebuild — Phase 6: the AI "ask the coach" layer.
 *
 * SERVER ONLY (uses GROQ_API_KEY, same key/slot as the meal coach). This is the
 * ONLY AI in the workout feature and it sits strictly ON TOP of the
 * deterministic plan: it explains form, cues and common mistakes for a SPECIFIC
 * exercise (grounded in that exercise's own dataset instructions) and answers
 * the user's question. It must NOT invent a new program or prescribe exact
 * medical advice — for changing an exercise it points back to the Swap button.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

export interface ExerciseCoachContext {
  name: string;
  muscles: string[];
  sets: number;
  reps: string;
  restSeconds: number;
  instructions: string[];
  // A little plan context so answers fit the user's situation.
  level: string;
  goalLabel: string;
}

function buildSystemPrompt(ctx: ExerciseCoachContext): string {
  const steps = ctx.instructions.length
    ? ctx.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")
    : "(no step text available — use your own reliable, general form knowledge for this exact movement)";

  return `You are a friendly, beginner-first fitness coach for both Western and South Asian users. Answer the user's question about ONE specific exercise from their plan.

EXERCISE: ${ctx.name}
TARGET MUSCLES: ${ctx.muscles.join(", ") || "general"}
PRESCRIBED: ${ctx.sets} sets × ${ctx.reps}, ${ctx.restSeconds}s rest
USER LEVEL: ${ctx.level}
USER GOAL: ${ctx.goalLabel}
OFFICIAL STEPS (ground your form advice in these):
${steps}

RULES:
- Be warm, simple and concise (a few short sentences or a tight bullet list). No shame.
- Stay focused on THIS exercise: form, setup, breathing, common mistakes, how it should feel.
- Ground form guidance in the OFFICIAL STEPS above; don't contradict them or invent a different lift.
- If they want a different/easier/harder movement, tell them to tap the "Swap" button (it picks a safe alternative from our database) — do NOT make up a new exercise name yourself.
- If they mention pain or a medical issue, gently advise stopping and seeing a qualified professional. Don't diagnose.
- Plain text only (you may use simple "- " bullets). No markdown headers, no JSON.`;
}

export async function askExerciseCoach(ctx: ExerciseCoachContext, question: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw aiConfigError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: buildSystemPrompt(ctx) },
          { role: "user", content: question },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The coach took too long to respond. Please try again.");
    }
    throw new Error("Couldn't reach the coach. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw await aiHttpError(res, "exercise-coach");
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content || !content.trim()) throw new Error("Empty response from the coach.");
  return content.trim();
}
