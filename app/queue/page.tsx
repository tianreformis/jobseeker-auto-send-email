import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db/helpers";
import { applications, jobs, scores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import QueueClient from "./client";

export const dynamic = "force-dynamic";

export default function QueuePage() {
  if (!isAuthenticated()) redirect("/login");
  const db = getDb();
  const apps = db.select().from(applications).all() as (typeof applications.$inferSelect)[];
  const items = apps
    .filter((a) => ["new", "drafted"].includes(a.status))
    .map((a) => {
      const j = db.select().from(jobs).where(eq(jobs.id, a.jobId)).get() as
        | typeof jobs.$inferSelect | undefined;
      const s = db.select().from(scores).where(eq(scores.jobId, a.jobId)).get() as
        | typeof scores.$inferSelect | undefined;
      return { app: a, job: j, score: s };
    });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Antrean Persetujuan ({items.length})</h1>
      <QueueClient items={JSON.parse(JSON.stringify(items))} />
    </div>
  );
}
