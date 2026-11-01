// Generate drafts for high-score applications.
// Usage: npx tsx worker/draft-batch.ts [minScore]
// Drafts status=new -> drafted via the same LLM pipeline as the dashboard.
process.loadEnvFile?.();
import { getDb } from "@/lib/db/helpers";
import { applications, scores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { draftForApplication } from "./pipeline/draft";

const minScore = Number(process.argv[2] ?? 70);

async function main(): Promise<void> {
  const db = getDb();
  const apps = db.select().from(applications).where(eq(applications.status, "new")).all() as
    (typeof applications.$inferSelect)[];
  console.log(`[draft-batch] new=${apps.length} minScore=${minScore}`);
  let drafted = 0, skippedLow = 0, failed = 0;
  for (const app of apps) {
    const s = db.select().from(scores).where(eq(scores.jobId, app.jobId)).get() as
      | { fitScore: number; modelUsed: string } | undefined;
    if (!s || s.fitScore < minScore) { skippedLow++; continue; }
    try {
      await draftForApplication(app.id);
      drafted++;
      console.log(`[draft-batch] drafted #${app.id} score=${s.fitScore}`);
    } catch (e) {
      failed++;
      console.log(`[draft-batch] #${app.id} FAILED: ${String(e).slice(0, 200)}`);
      break; // LLM down — stop, retry later
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`[draft-batch] done drafted=${drafted} skipped-low=${skippedLow} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
