// Export copy-ready application packets for platform jobs (assisted mode).
// Usage: npx tsx worker/assisted-pack.ts
// Writes out/assisted/app-<id>.md per drafted application: URL + subject +
// proposal + cover letter + checklist langkah manual.
process.loadEnvFile?.();
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDb, getJob } from "@/lib/db/helpers";
import { applications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function main(): Promise<void> {
  const db = getDb();
  const drafted = db.select().from(applications).where(eq(applications.status, "drafted")).all() as
    (typeof applications.$inferSelect)[];
  const dir = path.join(process.cwd(), "out", "assisted");
  mkdirSync(dir, { recursive: true });
  console.log(`[assisted-pack] drafted=${drafted.length}`);
  for (const app of drafted) {
    const job = getJob(app.jobId);
    if (!job) continue;
    const md = [
      `# Lamaran #${app.id} — ${job.title}`,
      ``,
      `- Perusahaan: ${job.company ?? "-"}`,
      `- URL lamar: ${job.url}`,
      `- Subjek (tempel ke form bila ada): ${app.emailSubject ?? "-"}`,
      ``,
      `## Proposal (salin-tempel)`,
      ``,
      app.proposalText ?? "(kosong)",
      ``,
      `## Langkah manual (5 menit per lamaran)`,
      ``,
      `1. Buka URL lamar di atas.`,
      `2. Daftar/masuk bila diminta (jangan bagikan kredensial ke bot).`,
      `3. Tempel proposal + subjek. Lampirkan CV PDF dari dasbor /queue bila diminta.`,
      `4. KLIK KIRIM SENDIRI di situs — bot tidak pernah auto-submit.`,
      `5. Kembali ke dasbor /queue, tekan "Sudah kirim manual" agar status jadi sent.`,
      ``,
      `_Dibuat otomatis ${new Date().toISOString()}_`,
      ``,
    ].join("\n");
    const file = path.join(dir, `app-${app.id}.md`);
    writeFileSync(file, md, "utf-8");
    console.log(`[assisted-pack] wrote ${path.basename(file)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
