// Telegram bot (grammy): daily digest + approve/skip inline buttons + /stop kill switch.
import { Bot, InlineKeyboard } from "grammy";
import { getDb, getSetting, logEvent, setAppStatus, setSetting, getApplication } from "@/lib/db/helpers";
import { applications, jobs, scores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

let bot: Bot | null = null;

export function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!bot) {
    bot = new Bot(token);
    bot.command("stop", async (ctx) => {
      setSetting("kill", "true");
      setSetting("mode", "review");
      await ctx.reply("⛔ Autopilot dihentikan (kill switch). Mode kembali ke review.");
    });
    bot.command("status", async (ctx) => {
      await ctx.reply(`Mode: ${getSetting("mode", "review")} | dry_run: ${getSetting("dry_run", "true")} | kill: ${getSetting("kill", "false")}`);
    });
    bot.on("callback_query:data", async (ctx) => {
      const [action, id] = (ctx.callbackQuery.data ?? "").split(":");
      const appId = Number(id);
      if (action === "approve") {
        const { nowIso, updateApplication } = await import("@/lib/db/helpers");
        updateApplication(appId, { status: "approved", approvedAt: nowIso() });
        logEvent(appId, "status:approved", { actor: "telegram", reason: "inline button" });
        await ctx.answerCallbackQuery("Disetujui");
        await ctx.editMessageText(`Lamaran #${appId} disetujui via Telegram.`);
      } else if (action === "skip") {
        setAppStatus(appId, "skipped", "telegram inline button");
        await ctx.answerCallbackQuery("Dilewati");
        await ctx.editMessageText(`Lamaran #${appId} dilewati via Telegram.`);
      }
    });
  }
  return bot;
}

export async function sendMessage(text: string): Promise<void> {
  const b = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!b || !chatId) {
    console.log("[telegram] not configured; message dropped:", text.slice(0, 120));
    return;
  }
  await b.api.sendMessage(chatId, text, { parse_mode: "HTML" });
}

/** Daily digest of pending queue with inline approve/skip buttons. */
export async function sendDigest(): Promise<void> {
  const b = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!b || !chatId) return;
  const db = getDb();
  const pending = (db.select().from(applications).all() as (typeof applications.$inferSelect)[])
    .filter((a) => ["new", "drafted"].includes(a.status)).slice(0, 10);
  if (pending.length === 0) {
    await b.api.sendMessage(chatId, "📭 Tidak ada lamaran menunggu review hari ini.");
    return;
  }
  for (const a of pending) {
    const j = db.select().from(jobs).where(eq(jobs.id, a.jobId)).get() as
      | typeof jobs.$inferSelect | undefined;
    const s = db.select().from(scores).where(eq(scores.jobId, a.jobId)).get() as
      | typeof scores.$inferSelect | undefined;
    const kb = new InlineKeyboard()
      .text("✅ Setujui", `approve:${a.id}`)
      .text("⏭ Lewati", `skip:${a.id}`);
    await b.api.sendMessage(
      chatId,
      `📝 <b>${j?.title ?? ""}</b> (${j?.company ?? ""})\nSkor: ${s?.fitScore ?? "—"}\n${(a.proposalText ?? "").slice(0, 500)}`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  }
}

/** Immediate notification for interview/question replies. */
export async function notifyReply(applicationId: number, category: string, summary: string): Promise<void> {
  const app = getApplication(applicationId);
  const emoji = category === "interview" ? "🎉" : category === "question" ? "❓" : "📩";
  await sendMessage(`${emoji} Balasan <b>${category}</b> untuk lamaran #${applicationId}: ${summary}`);
  void app;
}
