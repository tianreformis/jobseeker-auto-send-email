// IMAP inbox monitor: match replies to sent applications, classify with LLM,
// update status, notify Telegram for interview/question. NEVER auto-reply to needsHuman.
import { ImapFlow } from "imapflow";
import { llmJson, scoringModel } from "@/lib/llm";
import { REPLY_CLASS_SYSTEM } from "@/lib/prompts";
import { ReplyClassSchema } from "@/lib/schemas";
import { getDb, logEvent, nowIso, setAppStatus, updateApplication } from "@/lib/db/helpers";
import { applications, events } from "@/lib/db/schema";
import { notifyReply } from "@/lib/telegram";

function imapClient(): ImapFlow {
  return new ImapFlow({
    host: process.env.IMAP_HOST ?? "imap.gmail.com",
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user: process.env.IMAP_USER ?? "", pass: process.env.IMAP_PASS ?? "" },
    logger: false,
  });
}

/** Extract Message-ID / In-Reply-To headers and body text from raw source. */
function parseRaw(raw: string): { messageId: string; inReplyTo: string; from: string; subject: string; body: string } {
  const header = (name: string) => {
    const m = new RegExp(`^${name}:\\s*(.+)$`, "im").exec(raw);
    return (m?.[1] ?? "").trim();
  };
  const parts = raw.split(/\r?\n\r?\n/);
  const body = parts.slice(1).join("\n\n").replace(/<[^>]*>/g, " ").slice(0, 4000);
  return {
    messageId: header("Message-ID"), inReplyTo: header("In-Reply-To"),
    from: header("From"), subject: header("Subject"), body,
  };
}

/** Match an incoming reply to a sent application by stored message IDs in events. */
export function matchReplyToApplication(
  inReplyTo: string, messageId: string,
  listSentEvents?: () => Array<{ applicationId: number; payload: string | null }>,
): number | null {
  if (!inReplyTo && !messageId) return null;
  const rows = listSentEvents ? listSentEvents() : defaultSentEvents();
  for (const e of rows) {
    try {
      const p = JSON.parse(e.payload ?? "{}") as { messageId?: string };
      if (p.messageId && (p.messageId === inReplyTo || p.messageId === messageId)) {
        return e.applicationId;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function defaultSentEvents(): Array<{ applicationId: number; payload: string | null }> {
  const db = getDb();
  return (db.select().from(events).all() as (typeof events.$inferSelect)[])
    .filter((e) => e.type === "status:sent");
}

/** Classify reply text with LLM (email body treated as untrusted data). */
export async function classifyReply(subject: string, body: string) {
  return llmJson(ReplyClassSchema, {
    system: REPLY_CLASS_SYSTEM,
    user: `SUBJECT: ${subject.slice(0, 300)}\nBODY:\n${body.slice(0, 4000)}`,
    model: scoringModel(),
  });
}

/** Poll inbox once (idempotent; skips already-seen Message-IDs). */
export async function pollInboxOnce(): Promise<{ checked: number; matched: number }> {
  if (!process.env.IMAP_USER) {
    console.log("[inbox] IMAP_USER tidak diset — dilewati.");
    return { checked: 0, matched: 0 };
  }
  const client = imapClient();
  await client.connect();
  let checked = 0, matched = 0;
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 7 * 86400_000);
      for await (const msg of client.fetch({ since }, { source: true, envelope: true })) {
        checked++;
        const raw = msg.source?.toString() ?? "";
        const p = parseRaw(raw);
        const appId = matchReplyToApplication(p.inReplyTo, p.messageId);
        if (!appId) continue;
        // Skip if already processed this message
        const seen = getDb().select().from(events).all().some((e: typeof events.$inferSelect) =>
          e.type === "inbox:seen" && (e.payload ?? "").includes(p.messageId));
        if (seen) continue;
        logEvent(appId, "inbox:seen", { messageId: p.messageId, from: p.from.slice(0, 120) });
        const cls = await classifyReply(p.subject, p.body);
        logEvent(appId, "inbox:classify", cls);
        const statusMap: Record<string, string> = {
          interview: "interview", question: "replied", rejection: "rejected",
          auto_reply: "replied", other: "replied",
        };
        setAppStatus(appId, statusMap[cls.category] ?? "replied", cls.summary);
        matched++;
        if (cls.category === "interview" || cls.category === "question") {
          await notifyReply(appId, cls.category, cls.summary);
        }
        // HARD RULE: never auto-reply when needsHuman (price, schedule, contract, technical).
        if (cls.needsHuman) {
          logEvent(appId, "inbox:needs-human", { summary: cls.summary });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
  console.log(`[inbox] checked=${checked} matched=${matched} (${nowIso()})`);
  return { checked, matched };
}

/** Generate follow-up draft text (LLM) for a sent application with no reply. Caller enforces 1x rule. */
export async function followUpDraft(applicationId: number): Promise<string> {
  const { getApplication, getJob } = await import("@/lib/db/helpers");
  const { llmJson: j, writingModel: w } = await import("@/lib/llm");
  const { z } = await import("zod");
  const app = getApplication(applicationId);
  const job = app ? getJob(app.jobId) : undefined;
  const out = await j(z.object({ text: z.string() }), {
    system: "Tulis email follow-up singkat 2-3 kalimat untuk lamaran freelance. Nada sopan, tanpa klaim baru. Keluarkan JSON {text}.",
    user: `Lowongan: ${job?.title ?? ""} di ${job?.company ?? ""}. Proposal awal: ${(app?.proposalText ?? "").slice(0, 1500)}`,
    model: w(),
  });
  void updateApplication;
  return out.text;
}

export async function markNoResponse(applicationId: number): Promise<void> {
  setAppStatus(applicationId, "no_response", "follow-up sent, no further emails");
}
