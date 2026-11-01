"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FetchButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const router = useRouter();

  async function run(withBackfill: boolean) {
    setBusy(true); setMsg(withBackfill ? "Mengambil + skor LLM…" : "Mengambil lowongan…");
    try {
      const res = await fetch("/api/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backfill: withBackfill }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "gagal");
      const bf = d.backfill ? ` · LLM upgrade: ${d.backfill.upgraded} (sisa ${d.backfill.remaining})` : "";
      setMsg(`OK: +${d.added} baru, ${d.skipped} filter, ${d.deduped} duplikat${bf}.`);
      router.refresh();
    } catch (e) {
      setMsg(`Gagal: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <button onClick={() => run(false)} disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50">
        {busy ? "…" : "🔄 Ambil Otomatis"}
      </button>
      <button onClick={() => run(true)} disabled={busy} className="rounded border px-3 py-2 disabled:opacity-50" title="Ambil + upgrade skor LLM (butuh API key valid)">
        ✨ + Skor LLM
      </button>
      {msg && <span className="text-zinc-600">{msg}</span>}
    </span>
  );
}
