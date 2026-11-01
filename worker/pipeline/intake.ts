// Shared pipeline: intake -> extract (LLM) -> dedupe -> keyword -> score (LLM) -> application row.
// Falls back to keyword-only intake when LLM is unreachable (stores raw job, skips LLM steps).
import { llmJson, scoringModel } from "@/lib/llm";
import { EXTRACT_SYSTEM, SCORING_SYSTEM } from "@/lib/prompts";
import { ExtractSchema, ScoreSchema } from "@/lib/schemas";
import { isValidEmail, jobHash, keywordPass, normalizeUrl } from "@/lib/normalize";
import { loadProfile } from "@/lib/profile";
import { config } from "@/config";
import {
  findJobByUrl, getDb, insertJob, logEvent, nowIso,
} from "@/lib/db/helpers";
import { applications, scores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface IntakeInput {
  source: string;
  url?: string;
  rawText: string;
  externalId?: string;
}

/** Validate pasted input. Throws on invalid. */
export function validateIntake(input: IntakeInput): void {
  if (!input.rawText || input.rawText.trim().length < 20) {
    throw new Error("Teks lowongan terlalu pendek (min 20 karakter).");
  }
  if (input.rawText.length > 50_000) throw new Error("Teks lowongan terlalu panjang (maks 50.000 karakter).");
  if (input.url) {
    try {
      const u = new URL(input.url);
      if (!["http:", "https:"].includes(u.protocol)) throw new Error("bad protocol");
    } catch {
      throw new Error("URL tidak valid.");
    }
  }
}

export interface PipelineResult {
  jobId: number;
  applicationId: number;
  fitScore: number;
  status: string;
  deduped: boolean;
  pendingLlm?: boolean;
}

/**
 * Heuristic priority score (transparent, no LLM): counts profile-skill mentions.
 * 0-100 scale for SORTING ONLY — never used by autopilot gates (those need LLM fitScore).
 */
export function heuristicScore(title: string, description: string): { fitScore: number; matched: string[] } {
  const profile = loadProfile() as { skills?: { web?: string[]; ai?: string[] } };
  const hay = `${title}\n${description}`.toLowerCase();
  const all = [...(profile.skills?.web ?? []), ...(profile.skills?.ai ?? [])];
  const matched = all.filter((s) => s && hay.includes(s.toLowerCase()));
  // +12 per matched skill, cap 96; +4 if remote/freelance mentioned.
  let score = Math.min(96, matched.length * 12);
  if (/remote|freelance|contract/.test(hay)) score = Math.min(96, score + 4);
  return { fitScore: score, matched };
}

/**
 * Keyword-only intake used when the LLM is unreachable (bad key, quota, offline).
 * No fabrication: title/company from raw fields, keyword filter decides, score deferred.
 */
export function processIntakeKeywordOnly(input: IntakeInput): PipelineResult {
  validateIntake(input);
  const url = input.url ? normalizeUrl(input.url) : `manual:${jobHash(input.rawText.slice(0, 80), null)}`;
  const existing = findJobByUrl(url);
  if (existing) {
    const app = getDb().select().from(applications).where(eq(applications.jobId, existing.id)).get() as
      | { id: number; status: string } | undefined;
    const sc = getDb().select().from(scores).where(eq(scores.jobId, existing.id)).get() as
      | { fitScore: number } | undefined;
    return {
      jobId: existing.id, applicationId: app?.id ?? 0,
      fitScore: sc?.fitScore ?? 0, status: app?.status ?? "unknown", deduped: true,
    };
  }
  const title = input.rawText.split("\n")[0]?.slice(0, 120) || "(lowongan auto-fetch)";
  const jobId = insertJob({
    source: input.source,
    externalId: input.externalId ?? null,
    url,
    title,
    company: null,
    description: input.rawText.slice(0, 8000),
    location: null,
    remote: true,
    budgetText: null,
    postedAt: null,
    contactEmail: null,
    applyMethod: "unknown",
    rawJson: JSON.stringify({ pendingLlm: true, rawText: input.rawText.slice(0, 8000) }),
    createdAt: nowIso(),
  });
  const kw = keywordPass(title, input.rawText.slice(0, 8000));
  const db = getDb();
  const appRes = db.insert(applications).values({ jobId, status: "new", notes: "menunggu LLM (ekstraksi+skor)" }).run();
  const applicationId = Number(appRes.lastInsertRowid);
  logEvent(applicationId, "intake", { source: input.source, keyword: kw.reason, llm: "pending" });
  // Heuristic priority score (transparent, no LLM): counts profile-skill mentions.
  const prio = heuristicScore(title, input.rawText.slice(0, 8000));
  db.insert(scores).values({
    jobId,
    fitScore: prio.fitScore,
    tracks: "both",
    matchedSkills: JSON.stringify(prio.matched),
    gaps: JSON.stringify([]),
    redFlags: JSON.stringify([]),
    reasoning: `heuristik tanpa LLM (${prio.matched.length} skill cocok); menunggu skor LLM.`,
    modelUsed: "heuristic/keyword-only",
    createdAt: nowIso(),
  }).run();
  if (!kw.pass) {
    db.update(applications).set({ status: "skipped", notes: `filter awal: ${kw.reason}` })
      .where(eq(applications.id, applicationId)).run();
    logEvent(applicationId, "status:skipped", { reason: kw.reason });
    return { jobId, applicationId, fitScore: prio.fitScore, status: "skipped", deduped: false, pendingLlm: true };
  }
  return { jobId, applicationId, fitScore: prio.fitScore, status: "new", deduped: false, pendingLlm: true };
}

/** Full pipeline for one job (manual intake or auto source). Idempotent via URL unique. */
export async function processIntake(input: IntakeInput): Promise<PipelineResult> {
  validateIntake(input);
  const profile = loadProfile();

  // 1. LLM extraction
  let extracted;
  try {
    extracted = await llmJson(ExtractSchema, {
      system: EXTRACT_SYSTEM,
      user: `SOURCE: ${input.source}\nURL: ${input.url ?? "(none)"}\nTEXT:\n${input.rawText.slice(0, 12_000)}`,
      model: scoringModel(),
    });
  } catch (e) {
    // LLM down (bad key/quota/offline) -> keyword-only intake, no fabrication.
    logEvent(0, "intake:llm-unavailable", { source: input.source, error: String(e).slice(0, 200) });
    return processIntakeKeywordOnly(input);
  }

  const url = input.url ? normalizeUrl(input.url) : `manual:${jobHash(input.rawText.slice(0, 80), extracted.company ?? null)}`;
  const existing = findJobByUrl(url);
  if (existing) {
    const app = getDb().select().from(applications).where(eq(applications.jobId, existing.id)).get() as
      | { id: number; status: string } | undefined;
    const sc = getDb().select().from(scores).where(eq(scores.jobId, existing.id)).get() as
      | { fitScore: number } | undefined;
    return {
      jobId: existing.id, applicationId: app?.id ?? 0,
      fitScore: sc?.fitScore ?? 0, status: app?.status ?? "unknown", deduped: true,
    };
  }

  // 2. Save job
  const title = extracted.title ?? input.rawText.slice(0, 80);
  const applyMethod = extracted.applyMethod ?? "unknown";
  let contactEmail = extracted.contactEmail;
  if (contactEmail && !isValidEmail(contactEmail)) contactEmail = null;
  const jobId = insertJob({
    source: input.source,
    externalId: input.externalId ?? null,
    url,
    title,
    company: extracted.company,
    description: [extracted.description ?? "", input.rawText.slice(0, 8000)].filter(Boolean).join("\n\n--- aslinya ---\n"),
    location: extracted.location,
    remote: extracted.remote ?? true,
    budgetText: extracted.budgetText,
    postedAt: null,
    contactEmail,
    applyMethod,
    rawJson: JSON.stringify({ rawText: input.rawText.slice(0, 8000) }),
    createdAt: nowIso(),
  });

  // 3. Keyword pre-filter (LLM-free, user-tunable via config keywords)
  const jobDesc = extracted.description ?? input.rawText;
  const kw = keywordPass(title, jobDesc);
  const db = getDb();
  const appRes = db.insert(applications).values({ jobId, status: "new" }).run();
  const applicationId = Number(appRes.lastInsertRowid);
  logEvent(applicationId, "intake", { source: input.source, keyword: kw.reason });

  if (!kw.pass) {
    db.update(applications).set({ status: "skipped", notes: `filter awal: ${kw.reason}` })
      .where(eq(applications.id, applicationId)).run();
    logEvent(applicationId, "status:skipped", { reason: kw.reason });
    return { jobId, applicationId, fitScore: 0, status: "skipped", deduped: false };
  }

  // 4. LLM scoring (job text treated as untrusted data)
  const score = await llmJson(ScoreSchema, {
    system: SCORING_SYSTEM,
    user: `PROFILE:\n${JSON.stringify(profile).slice(0, 6000)}\n\nJOB:\nTitle: ${title}\nDescription:\n${jobDesc.slice(0, 8000)}`,
    model: scoringModel(),
  });
  const scoreRow: typeof scores.$inferInsert = {
    jobId,
    fitScore: score.fitScore,
    tracks: score.track ?? "both",
    matchedSkills: JSON.stringify(score.matchedSkills ?? []),
    gaps: JSON.stringify(score.gaps ?? []),
    redFlags: JSON.stringify(score.redFlags ?? []),
    reasoning: score.reasoning ?? "",
    modelUsed: scoringModel(),
    createdAt: nowIso(),
  };
  db.insert(scores).values(scoreRow).run();

  // 5. Threshold gate -> stays "new" (drafting happens in stage 3+); mark skipped if below
  if (score.fitScore < config.reviewThreshold) {
    db.update(applications).set({ status: "skipped", notes: `skor ${score.fitScore} < ${config.reviewThreshold}` })
      .where(eq(applications.id, applicationId)).run();
    logEvent(applicationId, "status:skipped", { fitScore: score.fitScore });
    return { jobId, applicationId, fitScore: score.fitScore, status: "skipped", deduped: false };
  }
  logEvent(applicationId, "scored", { fitScore: score.fitScore, track: score.track });
  return { jobId, applicationId, fitScore: score.fitScore, status: "new", deduped: false };
}

/**
 * Backfill LLM extraction+scoring for keyword-only rows (modelUsed = heuristic/keyword-only).
 * Called after the API key becomes valid: upgrades heuristic rows to real LLM rows.
 * Returns { upgraded, failed, remaining }.
 */
export async function backfillLlmScores(limit = 50): Promise<{ upgraded: number; failed: number; remaining: number }> {
  const db = getDb();
  const rows = db.select().from(scores).all() as (typeof scores.$inferSelect)[];
  const pending = rows.filter((s) => s.modelUsed === "heuristic/keyword-only").slice(0, limit);
  const profile = loadProfile();
  const { getJob } = await import("@/lib/db/helpers");
  let upgraded = 0, failed = 0;
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
      const { getApplication } = await import("@/lib/db/helpers");
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
      if (app && score.fitScore < config.reviewThreshold) {
        db.update(applications).set({ status: "skipped", notes: `skor LLM ${score.fitScore} < ${config.reviewThreshold}` })
          .where(eq(applications.id, app.id)).run();
      }
      if (app) logEvent(app.id, "scored", { fitScore: score.fitScore, track: score.track, via: "backfill" });
      upgraded++;
    } catch (e) {
      failed++;
      console.log(`[backfill] job=${s.jobId} failed: ${String(e).slice(0, 150)}`);
      break; // LLM still down -> stop, retry later
    }
  }
  const remaining = rows.filter((s) => s.modelUsed === "heuristic/keyword-only").length - upgraded;
  return { upgraded, failed, remaining: Math.max(0, remaining) };
}
