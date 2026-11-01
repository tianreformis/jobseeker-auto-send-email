// Email sender: approved-only, caps, MX check, audit events. No secrets in logs.
import nodemailer from "nodemailer";
import { promises as dns } from "node:dns";
import { config } from "@/config";
import {
  countSentSince, getApplication, getJob, logEvent, nowIso, setAppStatus, updateApplication,
} from "@/lib/db/helpers";
import { isValidEmail } from "@/lib/normalize";
import { checkCaps } from "@/lib/ratelimit";

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER ?? "", pass: process.env.SMTP_PASS ?? "" },
  });
}

export async function mxOk(email: string): Promise<boolean> {
  try {
    const domain = email.split("@")[1] ?? "";
    if (!domain || config.blocklist.includes(domain.toLowerCase())) return false;
    const mx = await dns.resolveMx(domain);
    return mx.length > 0;
  } catch {
    return false;
  }
}

/**
 * Send application email. HARD RULE: only status "approved" may be sent.
 * Returns { ok, error? }.
 */
export async function sendApprovedEmail(applicationId: number): Promise<{ ok: boolean; error?: string }> {
  const app = getApplication(applicationId);
  if (!app) return { ok: false, error: "not found" };
  if (app.status !== "approved") {
    return { ok: false, error: `refusing to send: status is ${app.status}, must be approved` };
  }
  const job = getJob(app.jobId);
  const to = job?.contactEmail;
  if (!to || !isValidEmail(to)) return { ok: false, error: "no valid contactEmail" };

  // Caps
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const hourAgo = new Date(Date.now() - 3600_000);
  const sentToday = countSentSince(today.toISOString());
  const sentHour = countSentSince(hourAgo.toISOString());
  const capHit = checkCaps(sentToday, sentHour);
  if (capHit) {
    updateApplication(applicationId, { status: "failed", errorMessage: capHit });
    logEvent(applicationId, "status:failed", { reason: capHit });
    return { ok: false, error: capHit };
  }
  if (!(await mxOk(to))) {
    updateApplication(applicationId, { status: "failed", errorMessage: "MX/blocklist check failed" });
    logEvent(applicationId, "status:failed", { reason: "mx-check" });
    return { ok: false, error: "MX check failed or domain blocked" };
  }

  try {
    const info = await transporter().sendMail({
      from: process.env.SMTP_USER ?? "",
      to,
      subject: app.emailSubject ?? `Lamaran: ${job?.title ?? ""}`,
      text: app.proposalText ?? "",
      attachments: app.cvVariantPath?.endsWith(".pdf")
        ? [{ filename: "CV.pdf", path: app.cvVariantPath }] : [],
    });
    updateApplication(applicationId, { status: "sent", sentAt: nowIso(), errorMessage: null });
    logEvent(applicationId, "status:sent", { messageId: info.messageId ?? "" });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "smtp error";
    updateApplication(applicationId, { status: "failed", errorMessage: msg.slice(0, 500) });
    logEvent(applicationId, "status:failed", { reason: msg.slice(0, 300) });
    return { ok: false, error: msg };
  }
}
