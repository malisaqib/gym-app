/**
 * SERVER ONLY. Gemini text embeddings for runtime queries.
 *
 * MUST stay identical to the seed script (scripts/seed-foods.mjs): same model,
 * same 768 dimensions, same L2-normalization — otherwise query vectors won't
 * line up with the stored catalog vectors and similarity search breaks.
 */
const MODEL = "gemini-embedding-001";
const DIM = 768;
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

export async function embedText(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Embeddings not configured (missing GEMINI_API_KEY).");

  // Abort if Gemini is slow, so a log never hangs.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: DIM,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("Embedding request timed out.");
    }
    throw new Error("Couldn't reach the embedding service.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`Gemini embed failed (${res.status}).`);
  const data = await res.json();
  const values: unknown = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error("Gemini returned no embedding.");

  // L2-normalize (required when truncating Matryoshka dims below 3072).
  const nums = values as number[];
  const norm = Math.sqrt(nums.reduce((s, v) => s + v * v, 0)) || 1;
  return nums.map((v) => v / norm);
}
