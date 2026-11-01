import { isAuthenticated } from "@/lib/auth";
import { getJob, getScoreForJob, getDb } from "@/lib/db/helpers";
import { applications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function JobDetail({ params }: { params: { id: string } }) {
  if (!isAuthenticated()) redirect("/login");
  const job = getJob(Number(params.id));
  if (!job) return <p>Lowongan tidak ditemukan.</p>;
  const score = getScoreForJob(job.id);
  const app = getDb().select().from(applications).where(eq(applications.jobId, job.id)).get() as
    | { id: number; status: string; notes: string | null } | undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{job.title}</h1>
      <p className="text-sm text-zinc-600">{job.company} · {job.source} · {job.applyMethod} · {job.budgetText}</p>
      {score && (
        <div className="rounded border bg-white p-4 text-sm">
          <p><strong>Skor: {score.fitScore}</strong> ({score.tracks}) — {score.modelUsed}</p>
          <p className="mt-1">{score.reasoning}</p>
          <p className="mt-1">Cocok: {score.matchedSkills}</p>
          <p>Gap: {score.gaps}</p>
          {score.redFlags !== "[]" && <p className="text-red-600">Red flags: {score.redFlags}</p>}
        </div>
      )}
      <div className="rounded border bg-white p-4 text-sm">
        <p>Status lamaran: <strong>{app?.status ?? "—"}</strong> {app?.notes ? `(${app.notes})` : ""}</p>
      </div>
      <pre className="whitespace-pre-wrap rounded bg-zinc-100 p-4 text-xs">{job.description}</pre>
    </div>
  );
}
