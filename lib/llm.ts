// Single LLM abstraction over an OpenAI-compatible endpoint (default: 9router local).
import OpenAI from "openai";
import { z } from "zod";

function client(): OpenAI {
  const baseURL = process.env.LLM_BASE_URL ?? "http://localhost:20128/v1";
  const apiKey = process.env.LLM_API_KEY ?? "";
  return new OpenAI({ baseURL, apiKey });
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return text.trim();
  return text.slice(start, end + 1);
}

/** Call LLM, parse JSON, validate with Zod. Retries once on malformed JSON. */
export async function llmJson<T>(
  schema: z.ZodType<T>,
  opts: { system: string; user: string; model: string; temperature?: number },
): Promise<T> {
  const c = client();
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await c.chat.completions.create({
      model: opts.model,
      temperature: opts.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    try {
      const parsed = schema.parse(JSON.parse(extractJson(raw)));
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`LLM JSON invalid after retry: ${String(lastErr)}`);
}

export function scoringModel(): string {
  return process.env.LLM_MODEL_SCORING ?? "muse/muse-spark-1.3";
}
export function writingModel(): string {
  return process.env.LLM_MODEL_WRITING ?? "muse/muse-spark-1.3";
}
export function auditModel(): string {
  return process.env.LLM_MODEL_AUDIT ?? "muse/muse-spark-1.3";
}
