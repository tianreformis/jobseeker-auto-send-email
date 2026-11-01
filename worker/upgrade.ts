// Upgrade heuristic rows to real LLM extraction+scoring (single LLM call per row for extract+score).
// Usage: npx tsx worker/upgrade.ts [limit]
process.loadEnvFile?.();
// - Skips rows already scored by a real model.
// - Demotes to skipped when LLM score < reviewThreshold.
// - Enriches job row with extracted company/contactEmail/applyMethod when present.
import { llmJson, scoringModel } from "@/lib/llm";
import { EXTRACT_SYSTEM, SCORING_SYSTEM } from "@/lib/prompts";
import { ExtractSchema, ScoreSchema } from "@/lib/schemas";
import { loadProfile } from "@/lib/profile";
import { isValidEmail, keywordPass } from "@/lib/normalize";
import { config } from "@/config";
import { getDb, getJob, logEvent, nowIso } from "@/lib/db/helpers";
import { applications, jobs, scores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const limit = Number(process.argv[2] ?? 50);

async function main(): Promise<void> {
  const db = getDb();
  const rows = db.select().from(scores).all() as (typeof scores.$inferSelect)[];
  const pending = rows.filter((s) => s.modelUsed === "heuristic/keyword-only").slice(0, limit);
  console.log(`[upgrade] pending=${rows.filter((s) => s.modelUsed === "heuristic/keyword-only").length}, processing=${pending.length}`);
  const profile = loadProfile();
  let upgraded = 0, failed = 0, skipped = 0;
  for (const s of pending) {
    const j = getJob(s.jobId);
    if (!j) { failed++; continue; }
    try {
      const extracted = await llmJson(ExtractSchema, {
        system: EXTRACT_SYSTEM,
        user: `SOURCE: ${j.source}\nURL: ${j.url}\nTEXT:\n${j.description.slice(0, 12_000)}`,
        model: scoringModel(),
      });
      const score = await llmJson(ScoreSchema, {
        system: SCORING_SYSTEM,
        user: `PROFILE:\n${JSON.stringify(profile).slice(0, 6000)}\n\nJOB:\nTitle: ${extracted.title ?? j.title}\nDescription:\n${(extracted.description ?? j.description).slice(0, 8000)}`,
        model: scoringModel(),
      });
      let contactEmail = extracted.contactEmail;
      if (contactEmail && !isValidEmail(contactEmail)) contactEmail = null;
      db.update(jobs).set({
        title: extracted.title ?? j.title,
        company: extracted.company ?? j.company,
        description: [extracted.description ?? "", j.description.slice(0, 6000)].filter(Boolean).join("\n\n--- aslinya ---\n"),
        location: extracted.location ?? j.location,
        remote: extracted.remote ?? true,
        budgetText: extracted.budgetText ?? j.budgetText,
        contactEmail: contactEmail ?? j.contactEmail,
        applyMethod: extracted.applyMethod ?? j.applyMethod,
      }).where(eq(jobs.id, j.id)).run();
      db.update(scores).set({
        fitScore: score.fitScore,
        tracks: score.track,
        matchedSkills: JSON.stringify(score.matchedSkills),
        gaps: JSON.stringify(score.gaps),
        redFlags: JSON.stringify(score.redFlags),
        reasoning: score.reasoning,
        modelUsed: scoringModel(),
      }).where(eq(scores.id, s.id)).run();
      const app = db.select().from(applications).where(eq(applications.jobId, j.id)).get() as
        | { id: number; status: string } | undefined;
      if (app) {
        if (score.fitScore < config.reviewThreshold) {
          db.update(applications).set({ status: "skipped", notes: `skor LLM ${score.fitScore} < ${config.reviewThreshold}` })
            .where(eq(applications.id, app.id)).run();
          skipped++;
        }
        logEvent(app.id, "scored", { fitScore: score.fitScore, track: score.track, via: "upgrade" });
      }
      upgraded++;
      console.log(`[upgrade] job=${j.id} score=${score.fitScore} email=${contactEmail ?? "-"} method=${extracted.applyMethod}`);
    } catch (e) {
      failed++;
      console.log(`[upgrade] job=${s.jobId} FAILED: ${String(e).slice(0, 200)}`);
      break;
    }
  }
  void nowIso; void keywordPass;
  console.log(`[upgrade] done upgraded=${upgraded} skipped-low=${skipped} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
