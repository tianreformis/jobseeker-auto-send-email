// Send all approved applications that have a valid contact email.
// Usage: npx tsx worker/send-batch.ts [--dry]
// - Only status=approved + valid contactEmail are sent (HARD RULE preserved).
// - Respects daily/hourly caps (5/day, 2/hour) and send window (08:00-17:00 Asia/Makassar).
// - Approved without contactEmail/draft are listed so the user can review them.
process.loadEnvFile?.();
import { inSendWindow } from "@/lib/ratelimit";
import { isValidEmail } from "@/lib/normalize";
import { getDb, getJob } from "@/lib/db/helpers";
import { applications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendApprovedEmail } from "./senders/email";

const dry = process.argv.includes("--dry");

async function main(): Promise<void> {
  const db = getDb();
  const approved = db.select().from(applications).where(eq(applications.status, "approved")).all() as
    (typeof applications.$inferSelect)[];
  console.log(`[send-batch] approved=${approved.length} dry=${dry} window-ok=${inSendWindow()}`);
  if (!inSendWindow() && !dry) {
    console.log("[send-batch] outside send window (08:00-17:00 Asia/Makassar) — aborting. Use --dry to preview.");
    return;
  }
  let sent = 0, blocked = 0, noEmail = 0, noDraft = 0;
  for (const app of approved) {
    const job = getJob(app.jobId);
    if (!job?.contactEmail || !isValidEmail(job.contactEmail)) {
      noEmail++;
      console.log(`[send-batch] #${app.id} "${(job?.title ?? "").slice(0, 60)}" — no email, skip`);
      continue;
    }
    if (!app.proposalText) {
      noDraft++;
      console.log(`[send-batch] #${app.id} "${(job?.title ?? "").slice(0, 60)}" — no draft, skip (buat draf dulu di /queue)`);
      continue;
    }
    if (dry) { console.log(`[send-batch] DRY #${app.id} -> ${job.contactEmail}`); continue; }
    const r = await sendApprovedEmail(app.id);
    if (r.ok) { sent++; console.log(`[send-batch] SENT #${app.id} -> ${job.contactEmail}`); }
    else { blocked++; console.log(`[send-batch] BLOCKED #${app.id}: ${r.error}`); }
    if (blocked > 0) break; // cap hit or SMTP error — stop, retry later
    await new Promise((r2) => setTimeout(r2, 30_000)); // 30s polite gap between sends
  }
  console.log(`[send-batch] done sent=${sent} no-email=${noEmail} no-draft=${noDraft} blocked=${blocked}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
