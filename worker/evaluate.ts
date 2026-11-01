// Evaluate autopilot gates for all drafted applications.
// Usage: npx tsx worker/evaluate.ts
// Reports per-app gate results; does NOT send or approve.
process.loadEnvFile?.();
import { countSentSince, getDb, getJob } from "@/lib/db/helpers";
import { applications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { evaluateGates } from "./autopilot/gates";

async function main(): Promise<void> {
  const db = getDb();
  const drafted = db.select().from(applications).where(eq(applications.status, "drafted")).all() as
    (typeof applications.$inferSelect)[];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sentToday = countSentSince(today.toISOString());
  const sentHour = countSentSince(new Date(Date.now() - 3600_000).toISOString());
  console.log(`[evaluate] drafted=${drafted.length} sentToday=${sentToday} sentHour=${sentHour}`);
  for (const app of drafted) {
    const job = getJob(app.jobId);
    const { allPass, results } = await evaluateGates(app.id, sentToday, sentHour);
    const fails = results.filter((r) => !r.pass).map((r) => `${r.failedGate}:${r.detail}`).join(" | ");
    console.log(`#${app.id} "${(job?.title ?? "").slice(0, 50)}" allPass=${allPass}${fails ? ` FAILS: ${fails}` : ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
