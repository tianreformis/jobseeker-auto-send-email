import { isAuthenticated } from "@/lib/auth";
import { getDb } from "@/lib/db/helpers";
import { applications, jobs, scores } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import AppsClient from "./client";

export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  if (!isAuthenticated()) redirect("/login");
  const db = getDb();
  const apps = db.select().from(applications).all() as (typeof applications.$inferSelect)[];
  const items = apps.map((a) => {
    const j = db.select().from(jobs).where(eq(jobs.id, a.jobId)).get() as
      | typeof jobs.$inferSelect | undefined;
    const s = db.select().from(scores).where(eq(scores.jobId, a.jobId)).get() as
      | typeof scores.$inferSelect | undefined;
    return { app: a, job: j, score: s };
  }).reverse();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lamaran ({items.length})</h1>
      <AppsClient items={JSON.parse(JSON.stringify(items))} />
    </div>
  );
}
