// Autopilot gates (section 7.7). ALL must pass; otherwise the application goes to /queue.
// Each gate is a pure/testable function; evaluateGates combines them.
import { llmJson, auditModel } from "@/lib/llm";
import { FACTCHECK_SYSTEM } from "@/lib/prompts";
import { FactCheckSchema } from "@/lib/schemas";
import { findTodos, loadProfile } from "@/lib/profile";
import { isValidEmail, wordCount } from "@/lib/normalize";
import { config } from "@/config";
import {
  getApplication, getJob, getScoreForJob, isDryRun, isKilled,
  recentCompanyContactCount,
} from "@/lib/db/helpers";
import { inSendWindow } from "@/lib/ratelimit";
import { mxOk } from "@/worker/senders/email";

export interface GateResult {
  pass: boolean;
  failedGate: string | null;
  detail: string;
}

/** Gate 1: email apply method + valid contact email. */
export function gateEmailMethod(job: { applyMethod: string; contactEmail: string | null }): GateResult {
  if (job.applyMethod !== "email") return { pass: false, failedGate: "gate1", detail: "applyMethod bukan email" };
  if (!job.contactEmail || !isValidEmail(job.contactEmail)) {
    return { pass: false, failedGate: "gate1", detail: "contactEmail tidak valid" };
  }
  return { pass: true, failedGate: null, detail: "ok" };
}

/** Gate 2: fitScore >= autoThreshold and no red flags. */
export function gateScore(fitScore: number, redFlags: string[]): GateResult {
  if (fitScore < config.autoThreshold) {
    return { pass: false, failedGate: "gate2", detail: `skor ${fitScore} < ${config.autoThreshold}` };
  }
  if (redFlags.length > 0) {
    return { pass: false, failedGate: "gate2", detail: `redFlags: ${redFlags.join("; ")}` };
  }
  return { pass: true, failedGate: null, detail: "ok" };
}

/** Gate 3: LLM fact-check (claims traceable to profile, no placeholders, 150-250 words, language match). */
export async function gateFactCheck(applicationId: number): Promise<GateResult> {
  const app = getApplication(applicationId);
  const job = app ? getJob(app.jobId) : undefined;
  if (!app?.proposalText || !job) return { pass: false, failedGate: "gate3", detail: "no draft" };
  const wc = wordCount(app.proposalText);
  if (wc < 150 || wc > 250) {
    return { pass: false, failedGate: "gate3", detail: `panjang ${wc} kata di luar 150-250` };
  }
  const profile = loadProfile();
  const res = await llmJson(FactCheckSchema, {
    system: FACTCHECK_SYSTEM,
    user: `PROFILE:\n${JSON.stringify(profile).slice(0, 6000)}\n\nJOB:\n${job.description.slice(0, 5000)}\n\nDRAFT:\n${app.proposalText}`,
    model: auditModel(),
  });
  if (!res.pass) {
    return {
      pass: false, failedGate: "gate3",
      detail: `unsupported=${res.unsupportedClaims.join("; ")} placeholders=${res.placeholders.join("; ")} issues=${res.issues.join("; ")}`,
    };
  }
  return { pass: true, failedGate: null, detail: "ok" };
}

/** Gate 4: profile has no TODO in fields used by the proposal. Pure (hermetic for tests). */
export function gateProfileCompleteFor(profile: Record<string, unknown>): GateResult {
  const used = ["email", "rate", "links", "availability", "projects", "languages"];
  const todos = findTodos(profile).filter((t) => used.some((u) => t.startsWith(u)));
  if (todos.length > 0) {
    return { pass: false, failedGate: "gate4", detail: `TODO di: ${todos.join(", ")}` };
  }
  return { pass: true, failedGate: null, detail: "ok" };
}

export function gateProfileComplete(): GateResult {
  return gateProfileCompleteFor(loadProfile() as Record<string, unknown>);
}

/** Gate 5: no application to same company/contact in last 30 days. */
export function gateNoRecentContact(company: string | null, email: string | null): GateResult {
  const n = recentCompanyContactCount(company, email, 30);
  if (n > 0) return { pass: false, failedGate: "gate5", detail: `${n} lamaran ke kontak sama <30 hari` };
  return { pass: true, failedGate: null, detail: "ok" };
}

/** Gate 6: within caps + send window. */
export function gateCapsWindow(sentToday: number, sentHour: number, now = new Date()): GateResult {
  if (sentToday >= config.maxPerDay) return { pass: false, failedGate: "gate6", detail: "batas harian tercapai" };
  if (sentHour >= config.maxPerHour) return { pass: false, failedGate: "gate6", detail: "batas per jam tercapai" };
  if (!inSendWindow(now)) return { pass: false, failedGate: "gate6", detail: "di luar jam kirim" };
  return { pass: true, failedGate: null, detail: "ok" };
}

/** Gate 7: domain not blocklisted + email syntax (MX checked separately before send). */
export function gateDomain(email: string): GateResult {
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  if (!domain || config.blocklist.includes(domain)) {
    return { pass: false, failedGate: "gate7", detail: "domain diblokir/tidak valid" };
  }
  return { pass: true, failedGate: null, detail: "ok" };
}

/** Full evaluation for one application. Returns ordered gate results. */
export async function evaluateGates(
  applicationId: number, sentToday: number, sentHour: number,
): Promise<{ allPass: boolean; results: GateResult[] }> {
  const app = getApplication(applicationId);
  const job = app ? getJob(app.jobId) : undefined;
  const score = app ? getScoreForJob(app.jobId) : undefined;
  const results: GateResult[] = [];
  if (!app || !job) {
    return { allPass: false, results: [{ pass: false, failedGate: "gate0", detail: "missing app/job" }] };
  }
  results.push(gateEmailMethod(job));
  let redFlags: string[] = [];
  try { redFlags = JSON.parse(score?.redFlags ?? "[]") as string[]; } catch { /* ignore */ }
  results.push(gateScore(score?.fitScore ?? 0, redFlags));
  results.push(await gateFactCheck(applicationId));
  results.push(gateProfileComplete());
  results.push(gateNoRecentContact(job.company, job.contactEmail));
  results.push(gateCapsWindow(sentToday, sentHour));
  results.push(gateDomain(job.contactEmail ?? ""));
  return { allPass: results.every((r) => r.pass), results };
}

/**
 * Autopilot decision for one drafted application:
 * - kill switch / not-autopilot -> return { action: "hold" }
 * - dryRun -> queue to outbox only, never send
 * - all gates pass -> approve + send (or outbox in dryRun)
 * - any gate fails -> leave in queue for manual review
 */
export async function autopilotDecide(
  applicationId: number, sentToday: number, sentHour: number,
): Promise<{ action: "send" | "outbox" | "queue" | "hold"; reason: string }> {
  const { getSetting } = await import("@/lib/db/helpers");
  if (isKilled()) return { action: "hold", reason: "kill switch aktif" };
  if (getSetting("mode", "review") !== "autopilot") return { action: "hold", reason: "bukan mode autopilot" };

  const { allPass, results } = await evaluateGates(applicationId, sentToday, sentHour);
  const app = getApplication(applicationId);
  const job = app ? getJob(app.jobId) : undefined;
  if (!allPass) {
    const failed = results.filter((r) => !r.pass).map((r) => `${r.failedGate}(${r.detail})`).join(", ");
    const { logEvent } = await import("@/lib/db/helpers");
    logEvent(applicationId, "autopilot:gate-fail", { failed });
    return { action: "queue", reason: `gerbang gagal: ${failed}` };
  }
  // All gates pass -> approve
  const { logEvent, nowIso, updateApplication, queueOutbox } = await import("@/lib/db/helpers");
  updateApplication(applicationId, { status: "approved", approvedAt: nowIso() });
  logEvent(applicationId, "status:approved", { actor: "autopilot", reason: "all 7 gates pass" });

  if (isDryRun()) {
    queueOutbox(applicationId, job?.contactEmail ?? "", app?.emailSubject ?? "", app?.proposalText ?? "");
    logEvent(applicationId, "autopilot:dry-run", { queued: true });
    return { action: "outbox", reason: "dryRun: masuk outbox, tidak dikirim" };
  }
  // Final MX check before real send
  if (!(await mxOk(job?.contactEmail ?? ""))) {
    return { action: "queue", reason: "MX check gagal" };
  }
  const { sendApprovedEmail } = await import("@/worker/senders/email");
  const r = await sendApprovedEmail(applicationId);
  return r.ok ? { action: "send", reason: "terkirim via autopilot" } : { action: "queue", reason: r.error ?? "send failed" };
}
