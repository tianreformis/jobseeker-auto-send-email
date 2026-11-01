// Drafting: proposal + subject + cover letter via LLM, CV variant HTML/PDF.
import { llmJson, writingModel } from "@/lib/llm";
import { PROPOSAL_SYSTEM } from "@/lib/prompts";
import { DraftSchema } from "@/lib/schemas";
import { loadProfile } from "@/lib/profile";
import { getApplication, getJob, getScoreForJob, logEvent, nowIso, updateApplication } from "@/lib/db/helpers";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export async function draftForApplication(applicationId: number, guidance = ""): Promise<void> {
  const app = getApplication(applicationId);
  if (!app) throw new Error("application not found");
  const job = getJob(app.jobId);
  if (!job) throw new Error("job not found");
  const profile = loadProfile();

  const draft = await llmJson(DraftSchema, {
    system: PROPOSAL_SYSTEM,
    user: `PROFILE:\n${JSON.stringify(profile).slice(0, 6000)}\n\nJOB:\nTitle: ${job.title}\nCompany: ${job.company ?? ""}\nDescription:\n${job.description.slice(0, 8000)}${guidance ? `\n\nCATATAN SAYA:\n${guidance.slice(0, 1000)}` : ""}`,
    model: writingModel(),
  });

  // CV variant path: track from score
  const score = getScoreForJob(job.id);
  const track = score?.tracks === "web" ? "web" : "ai";
  const cvHtml = renderCvHtml(profile, track, job);
  const dir = path.join(process.cwd(), "out", `app-${applicationId}`);
  mkdirSync(dir, { recursive: true });
  const cvPath = path.join(dir, `cv-${track}.html`);
  writeFileSync(cvPath, cvHtml, "utf-8");

  updateApplication(applicationId, {
    status: "drafted",
    proposalText: draft.proposal,
    emailSubject: draft.subject,
    cvVariantPath: cvPath,
    coverLetterPath: null,
    notes: `cover: ${draft.coverLetter.slice(0, 500)}`,
  });
  logEvent(applicationId, "status:drafted", { model: writingModel(), track });
}

/** ATS-friendly single-column CV HTML (rendered to PDF by Playwright in stage 3b). */
export function renderCvHtml(
  profile: Record<string, unknown>, track: string, job: { title: string },
): string {
  const esc = (s: unknown) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const skills = profile.skills as { web: string[]; ai: string[] };
  const ordered = track === "web" ? [...skills.web, ...skills.ai] : [...skills.ai, ...skills.web];
  const projects = (profile.projects as Array<{ name: string; track: string; desc: string; result: string }>)
    .sort((a, b) => (a.track === track ? -1 : 0) - (b.track === track ? -1 : 0));
  const links = profile.links as Record<string, string>;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:32px auto;color:#111;line-height:1.5}
h1{font-size:24px;margin:0}h2{font-size:15px;border-bottom:1px solid #333;margin-top:20px}
p,li{font-size:13px}</style></head><body>
<h1>${esc(profile.name)}</h1><p>${esc(profile.title)} | ${esc(profile.location)}</p>
<p>Email: ${esc(profile.email)} | Portfolio: ${esc(links.portfolio)} | GitHub: ${esc(links.github)} | LinkedIn: ${esc(links.linkedin)}</p>
<h2>Ringkasan</h2><p>${esc(profile.summary)}</p>
<h2>Keahlian (disesuaikan untuk: ${esc(job.title)})</h2><p>${ordered.map(esc).join(", ")}</p>
<h2>Proyek Relevan</h2><ul>${projects.map((p) => `<li><strong>${esc(p.name)}</strong> — ${esc(p.desc)}. Hasil: ${esc(p.result)}</li>`).join("")}</ul>
<h2>Pengalaman</h2><ul>${(profile.experience as Array<{ role: string; org: string; period: string }>).map((e) => `<li><strong>${esc(e.role)}</strong>, ${esc(e.org)} (${esc(e.period)})</li>`).join("")}</ul>
<h2>Pendidikan</h2><ul>${(profile.education as Array<{ degree: string; org: string; period: string }>).map((e) => `<li>${esc(e.degree)}, ${esc(e.org)} (${esc(e.period)})</li>`).join("")}</ul>
<h2>Publikasi</h2><p>${((profile.publications as string[]) ?? []).map(esc).join("; ")}</p>
<p>Ketersediaan: ${esc(profile.availability)}</p>
</body></html>`;
}

/** Manual edit of proposal (user edits are final). */
export function editProposal(applicationId: number, proposalText: string): void {
  updateApplication(applicationId, { proposalText });
  logEvent(applicationId, "proposal:edited", { by: "user" });
}
