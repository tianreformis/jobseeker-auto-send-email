// Worker: scheduled fetch -> pipeline -> digest. `npm run worker:once` for manual run.
process.loadEnvFile?.();
import cron from "node-cron";
import { ALL_SOURCES, politeDelay, type RawJob } from "./sources";
import { processIntake } from "./pipeline/intake";
import { draftForApplication } from "./pipeline/draft";
import { autopilotDecide } from "./autopilot/gates";
import { pollInboxOnce, followUpDraft, markNoResponse } from "./inbox";
import { sendApprovedEmail } from "./senders/email";
import { config } from "@/config";
import { getDb, countSentSince, getSetting, logEvent, setSetting, updateApplication } from "@/lib/db/helpers";
import { applications, events } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { sendDigest, getBot } from "@/lib/telegram";

const once = process.argv.includes("--once");
let consecutiveFailures = 0;

async function runFetch(): Promise<void> {
  console.log(`[worker] fetch start (${new Date().toISOString()})`);
  for (const src of ALL_SOURCES) {
    try {
      const jobs: RawJob[] = await src.fetch();
      console.log(`[worker] ${src.id}: ${jobs.length} fetched`);
      for (const j of jobs.slice(0, 30)) {
        try {
          const r = await processIntake({
            source: src.id,
            url: j.url,
            externalId: j.externalId,
            rawText: `Title: ${j.title}\nCompany: ${j.company ?? ""}\nLocation: ${j.location ?? ""}\nBudget: ${j.budgetText ?? ""}\nApply: ${j.applyMethod ?? "unknown"}\n\n${j.description}`,
          });
          if (r.status === "new") {
            try {
              await draftForApplication(r.applicationId);
            } catch (e) {
              console.log(`[worker] draft failed app=${r.applicationId}: ${String(e).slice(0, 200)}`);
            }
          }
          // Autopilot decision for drafted apps
          if (getSetting("mode", "review") === "autopilot") {
            await runAutopilotOne(r.applicationId);
          }
        } catch (e) {
          console.log(`[worker] intake failed (${src.id}): ${String(e).slice(0, 200)}`);
        }
        await politeDelay(500, 1500);
      }
    } catch (e) {
      console.log(`[worker] source ${src.id} failed: ${String(e).slice(0, 300)}`);
    }
    await politeDelay();
  }
  const db = getDb();
  const pending = (db.select().from(applications).all() as { status: string }[])
    .filter((a) => ["new", "drafted"].includes(a.status)).length;
  console.log(`[worker] done. pending review: ${pending}`);
}

async function runAutopilotOne(applicationId: number): Promise<void> {
  const db = getDb();
  const app = db.select().from(applications).where(eq(applications.id, applicationId)).get() as
    | typeof applications.$inferSelect | undefined;
  if (!app || !["drafted", "new"].includes(app.status)) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sentToday = countSentSince(today.toISOString());
  const sentHour = countSentSince(new Date(Date.now() - 3600_000).toISOString());
  const d = await autopilotDecide(applicationId, sentToday, sentHour);
  console.log(`[autopilot] app=${applicationId} action=${d.action} reason=${d.reason.slice(0, 160)}`);
  if (d.action === "send") consecutiveFailures = 0;
  if (d.action === "queue" && d.reason.includes("send failed")) {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      setSetting("kill", "true");
      setSetting("mode", "review");
      const { sendMessage } = await import("@/lib/telegram");
      await sendMessage("⛔ Autopilot dijeda otomatis: 3 kegagalan kirim berturut-turut.");
      logEvent(applicationId, "autopilot:auto-pause", { reason: "3 consecutive failures" });
    }
  }
}

/** Follow-up: sent > followUpAfterDays ago, no reply, max 1 per contact. */
async function runFollowUps(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - config.followUpAfterDays * 86400_000).toISOString();
  const sent = db.select().from(applications)
    .where(sql`${applications.status} = 'sent' AND ${applications.sentAt} < ${cutoff}`).all() as
    (typeof applications.$inferSelect)[];
  for (const a of sent) {
    const prior = db.select().from(events).all()
      .filter((e) => e.applicationId === a.id && e.type === "followup:sent").length;
    if (prior >= config.maxFollowUps) {
      await markNoResponse(a.id);
      continue;
    }
    if (getSetting("mode", "review") !== "autopilot" || getSetting("kill", "false") === "true") continue;
    try {
      const text = await followUpDraft(a.id);
      if (getSetting("dry_run", "true") === "true") {
        logEvent(a.id, "followup:dry-run", { text: text.slice(0, 300) });
        continue;
      }
      updateApplication(a.id, { proposalText: text });
      const r = await sendApprovedEmail(a.id); // app must be approved already (it was sent)
      void r;
      logEvent(a.id, "followup:sent", {});
    } catch (e) {
      console.log(`[followup] app=${a.id} failed: ${String(e).slice(0, 200)}`);
    }
  }
}

async function main(): Promise<void> {
  if (once) {
    await runFetch();
    await pollInboxOnce().catch((e) => console.log("[inbox]", String(e).slice(0, 200)));
    await runFollowUps().catch((e) => console.log("[followup]", String(e).slice(0, 200)));
    process.exit(0);
  }
  cron.schedule(config.schedule.fetchCron, () => { runFetch().catch(console.error); }, {
    timezone: "Asia/Makassar",
  });
  // Midday LLM-free fetch: keeps queue flowing even when the dashboard is closed.
  cron.schedule(config.schedule.fetchMiddayCron, async () => {
    try {
      const { ALL_SOURCES, politeDelay } = await import("./sources");
      const { processIntakeKeywordOnly } = await import("./pipeline/intake");
      for (const src of ALL_SOURCES) {
        try {
          const jobs = await src.fetch();
          for (const j of jobs.slice(0, 30)) {
            try {
              await processIntake({
                source: src.id, url: j.url, externalId: j.externalId,
                rawText: `Title: ${j.title}\nCompany: ${j.company ?? ""}\n\n${j.description}`,
              });
            } catch {
              try {
                processIntakeKeywordOnly({
                  source: src.id, url: j.url, externalId: j.externalId,
                  rawText: `Title: ${j.title}\nCompany: ${j.company ?? ""}\n\n${j.description}`,
                });
              } catch { /* skip one bad job */ }
            }
            await politeDelay(500, 1500);
          }
        } catch (e) { console.log(`[midday] ${src.id}: ${String(e).slice(0, 150)}`); }
        await politeDelay();
      }
    } catch (e) { console.log("[midday]", String(e).slice(0, 200)); }
  }, { timezone: "Asia/Makassar" });
  cron.schedule(config.schedule.inboxCron, () => { pollInboxOnce().catch(console.error); });
  cron.schedule(config.schedule.digestCron, () => { sendDigest().catch(console.error); }, {
    timezone: "Asia/Makassar",
  });
  cron.schedule("0 9 * * *", () => { runFollowUps().catch(console.error); }, {
    timezone: "Asia/Makassar",
  });
  // Telegram bot long-polling (for /stop + inline buttons)
  const bot = getBot();
  if (bot) {
    bot.start().catch((e: unknown) => console.log("[telegram]", String(e).slice(0, 200)));
    console.log("[worker] telegram bot started");
  }
  console.log(`[worker] scheduled: fetch ${config.schedule.fetchCron}, inbox ${config.schedule.inboxCron}, digest ${config.schedule.digestCron}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
