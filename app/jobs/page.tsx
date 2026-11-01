import { isAuthenticated } from "@/lib/auth";
import { listJobsWithScore } from "@/lib/db/helpers";
import { redirect } from "next/navigation";
import Link from "next/link";
import FetchButton from "./fetch-button";

export const dynamic = "force-dynamic";

export default function JobsPage() {
  if (!isAuthenticated()) redirect("/login");
  const rows = listJobsWithScore();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lowongan ({rows.length})</h1>
        <div className="flex gap-2">
          <FetchButton />
          <Link href="/jobs/new" className="rounded bg-black px-3 py-2 text-sm text-white">+ Input Baru</Link>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-zinc-500">
          <th className="py-2">Judul</th><th>Sumber</th><th>Skor</th><th>Status</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-2 font-medium">{r.title}
                {r.company && <span className="ml-2 text-zinc-500">{r.company}</span>}
              </td>
              <td>{r.source}</td>
              <td>{r.fitScore ?? "—"}</td>
              <td>{r.appStatus ?? "—"}</td>
              <td><Link href={`/jobs/${r.id}`} className="text-blue-600">Detail</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-sm text-zinc-500">Belum ada lowongan. Tambahkan lewat Input Baru.</p>}
    </div>
  );
}
