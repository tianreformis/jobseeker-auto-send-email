"use client";
import { useState } from "react";

interface Item {
  app: { id: number; status: string; proposalText: string | null; emailSubject: string | null; sentAt: string | null; errorMessage: string | null };
  job: { title: string; company: string | null; url: string; applyMethod: string; contactEmail: string | null } | undefined;
  score: { fitScore: number } | undefined;
}

export default function AppsClient({ items }: { items: Item[] }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  async function send(id: number, via: string) {
    setBusy(id); setMsg("");
    try {
      const res = await fetch(`/api/applications/${id}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ via }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "gagal");
      setMsg(`Terkirim via ${via}. Muat ulang halaman.`);
    } catch (e) {
      setMsg(`Gagal: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(null);
    }
  }

  function copyProposal(text: string) {
    navigator.clipboard.writeText(text).catch(() => setMsg("Gagal menyalin."));
    setMsg("Proposal disalin ke clipboard.");
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-blue-700">{msg}</p>}
      {items.map(({ app, job, score }) => (
        <div key={app.id} className="rounded border bg-white p-4 text-sm">
          <p className="font-semibold">{job?.title} <span className="font-normal text-zinc-500">{job?.company}</span></p>
          <p>Skor: {score?.fitScore ?? "—"} · Status: <strong>{app.status}</strong> · Via: {job?.applyMethod}
            {app.sentAt ? ` · Terkirim: ${app.sentAt}` : ""}</p>
          {app.errorMessage && <p className="text-red-600">Error: {app.errorMessage}</p>}
          {app.proposalText && (
            <details className="mt-2"><summary className="cursor-pointer text-blue-600">Lihat proposal</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-zinc-100 p-2 text-xs">{app.proposalText}</pre>
            </details>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {app.proposalText && <button onClick={() => copyProposal(app.proposalText ?? "")} className="rounded border px-3 py-1">Salin Proposal</button>}
            {job?.url.startsWith("http") && <a href={job.url} target="_blank" className="rounded border px-3 py-1">Buka Lowongan</a>}
            {app.status === "approved" && job?.applyMethod === "email" && (
              <button disabled={busy === app.id} onClick={() => send(app.id, "email")} className="rounded bg-green-700 px-3 py-1 text-white">Kirim Email</button>
            )}
            {["drafted", "approved"].includes(app.status) && job?.applyMethod !== "email" && (
              <button disabled={busy === app.id} onClick={() => send(app.id, "assisted")} className="rounded bg-zinc-800 px-3 py-1 text-white">Tandai Terkirim (manual)</button>
            )}
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-zinc-500">Belum ada lamaran.</p>}
    </div>
  );
}
