"use client";
import { useState } from "react";

interface Item {
  app: { id: number; status: string; proposalText: string | null; emailSubject: string | null; cvVariantPath: string | null };
  job: { title: string; company: string | null; url: string } | undefined;
  score: { fitScore: number; tracks: string; reasoning: string; gaps: string; redFlags: string } | undefined;
}

export default function QueueClient({ items }: { items: Item[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [guidance, setGuidance] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState("");

  async function call(id: number, method: string, path: string, body?: unknown) {
    setBusy(id); setMsg("");
    try {
      const res = await fetch(`/api/applications/${id}${path}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "gagal");
      setMsg(`OK: ${JSON.stringify(data)} — muat ulang halaman.`);
    } catch (e) {
      setMsg(`Gagal: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-blue-700">{msg}</p>}
      {items.map(({ app, job, score }) => (
        <div key={app.id} className="rounded border bg-white p-4">
          <p className="font-semibold">{job?.title} <span className="font-normal text-zinc-500">{job?.company}</span></p>
          <p className="text-sm">Skor: <strong>{score?.fitScore ?? "—"}</strong> ({score?.tracks}) · Status: {app.status}</p>
          {score && <p className="text-sm text-zinc-600">{score.reasoning} | Gap: {score.gaps} | Flags: {score.redFlags}</p>}
          <p className="text-xs text-zinc-500">Subjek: {app.emailSubject ?? "—"}</p>
          <textarea
            defaultValue={app.proposalText ?? ""}
            onChange={(e) => setEdits((m) => ({ ...m, [app.id]: e.target.value }))}
            rows={8}
            className="mt-2 w-full rounded border p-2 text-sm"
            placeholder="Proposal (buat draf dulu bila kosong)"
          />
          <input
            placeholder="Arahan regenerate (opsional)"
            onChange={(e) => setGuidance((m) => ({ ...m, [app.id]: e.target.value }))}
            className="mt-2 w-full rounded border px-2 py-1 text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <button disabled={busy === app.id} onClick={() => call(app.id, "POST", "/draft", { guidance: guidance[app.id] ?? "" })} className="rounded bg-zinc-800 px-3 py-1 text-white">Buat/Regenerate Draf</button>
            <button disabled={busy === app.id} onClick={() => call(app.id, "POST", "", { proposalText: edits[app.id] ?? app.proposalText ?? "" })} className="rounded border px-3 py-1">Simpan Edit</button>
            <button disabled={busy === app.id} onClick={() => call(app.id, "POST", "/pdf")} className="rounded border px-3 py-1">Render PDF CV</button>
            <button disabled={busy === app.id} onClick={() => call(app.id, "PATCH", "", { action: "approve" })} className="rounded bg-green-700 px-3 py-1 text-white">Setujui</button>
            <button disabled={busy === app.id} onClick={() => call(app.id, "PATCH", "", { action: "skip" })} className="rounded bg-red-700 px-3 py-1 text-white">Lewati</button>
            {job?.url.startsWith("http") && <a href={job.url} target="_blank" className="rounded border px-3 py-1">Buka Lowongan</a>}
          </div>
          {app.cvVariantPath && <p className="mt-1 text-xs text-zinc-500">CV: {app.cvVariantPath}</p>}
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-zinc-500">Antrean kosong.</p>}
    </div>
  );
}
