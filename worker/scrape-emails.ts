// Scrape contact emails from job detail pages (legal sources only: remotive/remoteok/wwr).
// Usage: npx tsx worker/scrape-emails.ts [limit] [minScore]
// - Read-only fetch with polite delays, respects ToS (no login, no CAPTCHA bypass).
// - Updates jobs.contact_email + applyMethod=email when a plausible recruiter email is found.
// - Skips hn threads and manual_only platforms.
process.loadEnvFile?.();
import { getDb } from "@/lib/db/helpers";
import { jobs, scores, applications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isValidEmail } from "@/lib/normalize";
import { politeDelay } from "./sources";

const limit = Number(process.argv[2] ?? 40);
const minScore = Number(process.argv[3] ?? 30);

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JUNK = /example\.|sentry|schema|wixpress|hello@remotive|support@weworkremotely|noreply|no-reply|privacy|terms|greenhouse\.io|lever\.co|ashby|workable|bamboohr/i;

function pickEmail(html: string): string | null {
  const all = new Set<string>();
  // mailto: links first (higher signal)
  const mailtoRe = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(html))) all.add((m[1] ?? "").toLowerCase());
  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(html))) {
    const e = (m[0] ?? "").toLowerCase();
    if (e.length > 80) continue;
    all.add(e);
  }
  const cands = Array.from(all).filter((e) => isValidEmail(e) && !JUNK.test(e));
  if (cands.length === 0) return null;
  // prefer hiring-addresses
  const pref = cands.find((e) => /jobs|career|hiring|hr|recruit|talent|apply|hello|contact|team/i.test(e));
  return pref ?? cands[0] ?? null;
}

function looksEmailApply(html: string, email: string): boolean {
  const low = html.toLowerCase();
  const idx = low.indexOf(email.toLowerCase());
  const ctx = idx >= 0 ? low.slice(Math.max(0, idx - 400), idx + 200) : "";
  return /apply|send.*resume|submit.*resume|send.*cv|email.*resume/i.test(ctx) || /how to apply/i.test(low);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(url, {
      headers: { "User-Agent": "JobHunter/1.0 (personal use; contact tianreformis@gmail.com)" },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/")) return null;
    const txt = await res.text();
    return txt.slice(0, 200_000);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const db = getDb();
  const allScores = db.select().from(scores).all() as (typeof scores.$inferSelect)[];
  const wanted = new Map<number, number>();
  for (const s of allScores) {
    if (s.fitScore >= minScore) wanted.set(s.jobId, s.fitScore);
  }
  const allJobs = db.select().from(jobs).all() as (typeof jobs.$inferSelect)[];
  const queue = allJobs
    .filter((j) => !j.contactEmail && wanted.has(j.id) && j.url.startsWith("http") && !j.url.includes("news.ycombinator.com"))
    .sort((a, b) => (wanted.get(b.id) ?? 0) - (wanted.get(a.id) ?? 0))
    .slice(0, limit);
  console.log(`[scrape-emails] queue=${queue.length} minScore=${minScore}`);
  let found = 0, checked = 0, failed = 0;
  for (const j of queue) {
    checked++;
    const html = await fetchHtml(j.url);
    if (!html) { failed++; console.log(`[${checked}/${queue.length}] #${j.id} fetch-fail`); await politeDelay(1500, 3000); continue; }
    const email = pickEmail(html);
    if (email) {
      const emailApply = looksEmailApply(html, email);
      db.update(jobs).set({ contactEmail: email, applyMethod: emailApply ? "email" : j.applyMethod }).where(eq(jobs.id, j.id)).run();
      const app = db.select().from(applications).where(eq(applications.jobId, j.id)).get() as { id: number } | undefined;
      if (app) {
        const { logEvent } = await import("@/lib/db/helpers");
        logEvent(app.id, "scrape:email-found", { email, emailApply });
      }
      found++;
      console.log(`[${checked}/${queue.length}] #${j.id} EMAIL=${email} emailApply=${emailApply}`);
    } else {
      console.log(`[${checked}/${queue.length}] #${j.id} no-email`);
    }
    await politeDelay(1500, 3500);
  }
  console.log(`[scrape-emails] done checked=${checked} found=${found} failed=${failed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
