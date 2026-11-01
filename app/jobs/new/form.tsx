"use client";
import { useState } from "react";

export default function NewJobForm() {
  const [rawText, setRawText] = useState("");
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, url: url || undefined, rawText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "gagal");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Input Lowongan Baru</h1>
      <p className="text-sm text-zinc-600">
        Tempel URL atau teks lowongan dari Upwork, LinkedIn, Sribulancer, grup WA/Telegram, dll.
      </p>
      <div className="grid gap-3">
        <label className="text-sm">Sumber
          <input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" placeholder="manual / upwork / linkedin ..." />
        </label>
        <label className="text-sm">URL (opsional)
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" placeholder="https://..." />
        </label>
        <label className="text-sm">Teks lowongan
          <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={12} className="mt-1 w-full rounded border p-3 font-mono text-xs" placeholder="Tempel teks lowongan di sini (min 20 karakter)" />
        </label>
        <button onClick={submit} disabled={busy} className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? "Memproses (ekstraksi + skor)…" : "Proses Lowongan"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result !== null && (
          <pre className="overflow-auto rounded bg-zinc-900 p-3 text-xs text-green-200">{JSON.stringify(result, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
