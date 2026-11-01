// Assisted mode: copy-ready proposal + open URL; optional headful form-fill that
// STOPS BEFORE SUBMIT for platforms whose automation is not "manual_only".
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "@/config";
import { getApplication, getJob, logEvent } from "@/lib/db/helpers";

/** Mark application as sent after the user manually submitted on the platform. */
export function markAssistedSent(applicationId: number): void {
  const { setAppStatus } = require("@/lib/db/helpers") as typeof import("@/lib/db/helpers");
  setAppStatus(applicationId, "sent", "manual submit by user (assisted)");
}

/**
 * Headful browser: open job URL, screenshot proof, NEVER auto-submit.
 * Refuses manual_only platforms and email jobs.
 */
export async function assistedOpen(applicationId: number, platform: string): Promise<{ ok: boolean; error?: string; proof?: string }> {
  const level = config.platforms[platform]?.automation;
  if (!level || level === "manual_only") {
    return { ok: false, error: `platform ${platform} is manual_only: gunakan "Buka & Salin" manual` };
  }
  const app = getApplication(applicationId);
  const job = app ? getJob(app.jobId) : undefined;
  if (!job?.url.startsWith("http")) return { ok: false, error: "no job URL" };
  const dir = path.join(process.cwd(), "out", "proofs");
  mkdirSync(dir, { recursive: true });
  const proof = path.join(dir, `app-${applicationId}-${Date.now()}.png`);
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.screenshot({ path: proof });
    logEvent(applicationId, "assisted:opened", { platform, proof: path.basename(proof) });
    // STOP: user takes over from here. Browser stays open until user closes it.
    return { ok: true, proof };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "browser error" };
  }
  // NOTE: browser intentionally left open for the user; closed when process exits.
}
