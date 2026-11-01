import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

/**
 * POST /api/fetch -> run auto-fetch from free sources (keyword-only intake, no LLM needed).
 * Query/body { backfill?: boolean } -> also upgrade heuristic rows via LLM when key is valid.
 */
export async function POST(req: NextRequest) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let backfill = false;
  try {
    const body = (await req.json()) as { backfill?: boolean };
    backfill = body.backfill === true;
  } catch { /* no body */ }
  const { ALL_SOURCES, politeDelay } = await import("@/worker/sources");
  const { processIntakeKeywordOnly, backfillLlmScores } = await import("@/worker/pipeline/intake");
  let added = 0, skipped = 0, deduped = 0, failed = 0;
  const perSource: Record<string, number> = {};
  for (const src of ALL_SOURCES) {
    try {
      const jobs = await src.fetch();
      perSource[src.id] = jobs.length;
      for (const j of jobs.slice(0, 30)) {
        try {
          const r = processIntakeKeywordOnly({
            source: src.id,
            url: j.url,
            externalId: j.externalId,
            rawText: `Title: ${j.title}\nCompany: ${j.company ?? ""}\nLocation: ${j.location ?? ""}\nBudget: ${j.budgetText ?? ""}\nApply: ${j.applyMethod ?? "unknown"}\n\n${j.description}`,
          });
          if (r.deduped) deduped++;
          else if (r.status === "skipped") skipped++;
          else added++;
        } catch { failed++; }
        await politeDelay(200, 600);
      }
    } catch (e) {
      perSource[src.id] = -1;
      console.log(`[api/fetch] ${src.id} failed: ${String(e).slice(0, 200)}`);
    }
    await politeDelay(500, 1200);
  }
  let bf: { upgraded: number; failed: number; remaining: number } | null = null;
  if (backfill) {
    try {
      bf = await backfillLlmScores(50);
    } catch (e) {
      bf = { upgraded: 0, failed: 1, remaining: -1 };
      console.log(`[api/fetch] backfill failed: ${String(e).slice(0, 200)}`);
    }
  }
  return NextResponse.json({ added, skipped, deduped, failed, perSource, backfill: bf });
}
