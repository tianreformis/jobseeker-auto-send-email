// Auto-fetch jobs from free sources into DB WITHOUT requiring LLM.
// Uses keyword-only intake (no fabrication); LLM enriches later when key is valid.
// Run: npx tsx worker/fetch.ts (cron or manual). Idempotent via URL unique.
process.loadEnvFile?.();
import { ALL_SOURCES, politeDelay, type RawJob } from "./sources";
import { processIntakeKeywordOnly } from "./pipeline/intake";

async function main(): Promise<void> {
  console.log(`[fetch] start (${new Date().toISOString()})`);
  let added = 0, skipped = 0, failed = 0, deduped = 0;
  for (const src of ALL_SOURCES) {
    try {
      const jobs: RawJob[] = await src.fetch();
      console.log(`[fetch] ${src.id}: ${jobs.length} fetched`);
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
        } catch (e) {
          failed++;
          console.log(`[fetch] intake failed (${src.id}): ${String(e).slice(0, 200)}`);
        }
        await politeDelay(300, 800);
      }
    } catch (e) {
      console.log(`[fetch] source ${src.id} failed: ${String(e).slice(0, 300)}`);
    }
    await politeDelay();
  }
  console.log(`[fetch] done. added=${added} skipped=${skipped} deduped=${deduped} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
