"use client";
import { useEffect, useState } from "react";

export default function SettingsClient() {
  const [s, setS] = useState<{ mode: string; dry_run: string; kill: string; outbox: number } | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/settings");
    setS(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function act(action: string) {
    setMsg("");
    if ((action === "enable_autopilot" || action === "end_dry_run" || action === "kill") &&
      !confirm(`Yakin: ${action}? Autopilot selalu mulai dengan dry-run 3 hari.`)) return;
    const r = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, confirm: true }),
    });
    const d = await r.json();
    if (!r.ok) setMsg(`Gagal: ${d.error}`);
    else { setMsg("OK tersimpan."); load(); }
  }

  if (!s) return <p>Memuat…</p>;
  return (
    <div className="space-y-4 text-sm">
      {msg && <p className="text-blue-700">{msg}</p>}
      <div className="rounded border bg-white p-4">
        <p>Mode: <strong>{s.mode}</strong></p>
        <p>Dry-run: <strong>{s.dry_run}</strong></p>
        <p>Kill: <strong>{s.kill}</strong></p>
        <p>Outbox (dry-run): <strong>{s.outbox}</strong></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => act("enable_autopilot")} className="rounded bg-amber-600 px-3 py-2 text-white">Aktifkan Autopilot (mulai dry-run)</button>
        <button onClick={() => act("end_dry_run")} className="rounded bg-green-700 px-3 py-2 text-white">Akhiri Dry-run</button>
        <button onClick={() => act("kill")} className="rounded bg-red-700 px-3 py-2 text-white">⛔ Jeda Semua (kill)</button>
        <button onClick={() => act("resume")} className="rounded border px-3 py-2">Lanjutkan (batal kill)</button>
      </div>
      <p className="text-zinc-600">
        Autopilot tidak pernah aktif sendiri. Pengiriman sungguhan hanya setelah dry-run diakhiri
        eksplisit, dan hanya untuk lamaran email yang lolos semua 7 gerbang.
      </p>
    </div>
  );
}
