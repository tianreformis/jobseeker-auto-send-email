// Export master CV (HTML + PDF) from data/profile.json, ordered by market demand.
// Usage: npx tsx worker/cv-export.ts
// Only uses facts from profile.json (+ phone/GPA already present in the user's own CV PDF).
process.loadEnvFile?.();
import { loadProfile } from "@/lib/profile";
import { htmlToPdf } from "@/lib/pdf";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

async function main(): Promise<void> {
  const p = loadProfile() as {
    name: string; title: string; location: string; email: string; phone?: string;
    links: Record<string, string>; summary: string;
    skills: { web: string[]; ai: string[] };
    projects: Array<{ name: string; desc: string; result: string }>;
    experience: Array<{ role: string; org: string; period: string }>;
    education: Array<{ degree: string; org: string; period: string; detail?: string }>;
    publications: string[]; availability: string;
  };

  const expBullets: Record<string, string[]> = {
    "Freelance Full-Stack Developer": [
      "Built and deployed SaaS apps with React, TypeScript, Next.js, Tailwind CSS, PostgreSQL",
      "Integrated LLM APIs (OpenAI, Gemini, OpenRouter): RAG, chatbots, AI automation",
      "Full SDLC ownership: requirements, development, testing, cloud deployment",
      "Migrated legacy systems (PHP/Delphi) into modern API-based architectures",
    ],
    "Informatics Teacher & Head of Computer Lab": [
      "Curriculum in computer systems, programming, networking aligned with AI trends",
      "AI-based learning modules with Python (Scikit-learn); admin automation via AI APIs",
      "Mentored students for programming competitions (city to national level)",
      "Managed school servers and network infrastructure",
    ],
    "Computer Lab Assistant": [
      "Taught programming fundamentals (C++, PHP, JavaScript)",
      "Technical support and mentoring to 500+ students",
    ],
  };

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:36px auto;color:#111;line-height:1.55}
h1{font-size:26px;margin:0}h2{font-size:15px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #222;margin:22px 0 8px;padding-bottom:3px}
p,li{font-size:13.5px;margin:4px 0}.sub{color:#333;font-size:14px}.contact{font-size:13px}
ul{padding-left:20px;margin:6px 0}</style></head><body>
<h1>${esc(p.name)}</h1>
<p class="sub">${esc(p.title)}</p>
<p class="contact">${esc(p.location)}${p.phone ? ` | Phone: ${esc(p.phone)}` : ""} | Email: ${esc(p.email)} | GitHub: ${esc(p.links.github)} | LinkedIn: ${esc(p.links.linkedin)} | Portfolio: ${esc(p.links.portfolio)}</p>
<h2>Professional Summary</h2><p>${esc(p.summary)}</p>
<h2>Technical Skills</h2>
<p><strong>Frontend:</strong> ${esc(p.skills.web.slice(0, 4).join(", "))}</p>
<p><strong>Backend &amp; Data:</strong> ${esc(p.skills.web.slice(4).join(", "))}</p>
<p><strong>AI:</strong> ${esc(p.skills.ai.join(", "))}</p>
<h2>Professional Experience</h2>
${p.experience.map((e) => `<p><strong>${esc(e.role)}</strong> — ${esc(e.org)} (${esc(e.period)})</p><ul>${(expBullets[e.role] ?? []).map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`).join("")}
<h2>Selected Projects</h2>
<ul>${p.projects.map((pr) => `<li><strong>${esc(pr.name)}</strong> — ${esc(pr.desc)}. ${esc(pr.result)}</li>`).join("")}</ul>
<h2>Education</h2>
<ul>${p.education.map((e) => `<li>${esc(e.degree)}, ${esc(e.org)} (${esc(e.period)})${e.detail ? ` | ${esc(e.detail)}` : ""}</li>`).join("")}</ul>
<h2>Publications</h2><p>${p.publications.slice(0, 5).map(esc).join("; ")}.</p>
<p>Availability: ${esc(p.availability)}</p>
</body></html>`;

  const dir = path.join(process.cwd(), "out", "cv-master");
  mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, "cv-master.html");
  const pdfPath = path.join(dir, "cv-master.pdf");
  writeFileSync(htmlPath, html, "utf-8");
  await htmlToPdf(htmlPath, pdfPath);
  console.log("CV exported:", htmlPath, "->", pdfPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
