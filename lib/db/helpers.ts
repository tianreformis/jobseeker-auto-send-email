// DB helpers over Drizzle + better-sqlite3 (synchronous driver).
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "./client";
import { jobs, scores, applications, events, settings, outbox } from "./schema";

export { getDb };

export function nowIso(): string {
  return new Date().toISOString();
}

export function logEvent(applicationId: number, type: string, payload: unknown): void {
  getDb().insert(events).values({
    applicationId, type, payload: JSON.stringify(payload ?? {}), createdAt: nowIso(),
  }).run();
}

export function getSetting(key: string, fallback: string): string {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get() as
    | { key: string; value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  getDb().insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export function isAutopilot(): boolean {
  return getSetting("mode", "review") === "autopilot";
}

export function isDryRun(): boolean {
  return getSetting("dry_run", "true") === "true";
}

export function isKilled(): boolean {
  return getSetting("kill", "false") === "true";
}

export type JobRow = typeof jobs.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;

export function findJobByUrl(url: string): JobRow | undefined {
  return getDb().select().from(jobs).where(eq(jobs.url, url)).get() as JobRow | undefined;
}

export function insertJob(data: typeof jobs.$inferInsert): number {
  const res = getDb().insert(jobs).values(data).run();
  return Number(res.lastInsertRowid);
}

export function listJobsWithScore(limit = 100): Array<JobRow & { fitScore: number | null; appStatus: string | null; appId: number | null }> {
  const db = getDb();
  const rows = db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit).all() as JobRow[];
  return rows.map((j) => {
    const s = db.select().from(scores).where(eq(scores.jobId, j.id)).get() as
      | { fitScore: number } | undefined;
    const a = db.select().from(applications).where(eq(applications.jobId, j.id)).get() as
      | { status: string; id: number } | undefined;
    return { ...j, fitScore: s?.fitScore ?? null, appStatus: a?.status ?? null, appId: a?.id ?? null };
  });
}

export function getApplication(id: number): ApplicationRow | undefined {
  return getDb().select().from(applications).where(eq(applications.id, id)).get() as
    ApplicationRow | undefined;
}

export function getJob(id: number): JobRow | undefined {
  return getDb().select().from(jobs).where(eq(jobs.id, id)).get() as JobRow | undefined;
}

export function getScoreForJob(jobId: number) {
  return getDb().select().from(scores).where(eq(scores.jobId, jobId)).get() as
    | typeof scores.$inferSelect | undefined;
}

export function updateApplication(id: number, patch: Partial<typeof applications.$inferInsert>): void {
  getDb().update(applications).set(patch).where(eq(applications.id, id)).run();
}

export function setAppStatus(id: number, status: string, note?: string): void {
  updateApplication(id, { status });
  logEvent(id, `status:${status}`, { note: note ?? "" });
}

export function countSentSince(sinceIso: string): number {
  const r = getDb().select({ n: sql<number>`count(*)` }).from(applications)
    .where(sql`${applications.sentAt} >= ${sinceIso}`).get() as { n: number };
  return r.n;
}

export function recentCompanyContactCount(company: string | null, email: string | null, days: number): number {
  if (!company && !email) return 0;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = getDb().select().from(applications).all() as ApplicationRow[];
  let n = 0;
  for (const a of rows) {
    if (!a.sentAt || a.sentAt < since) continue;
    const j = getJob(a.jobId);
    if (!j) continue;
    if (company && j.company && j.company.toLowerCase() === company.toLowerCase()) n++;
    else if (email && j.contactEmail && j.contactEmail.toLowerCase() === email.toLowerCase()) n++;
  }
  return n;
}

export function queueOutbox(applicationId: number, toEmail: string, subject: string, body: string): void {
  getDb().insert(outbox).values({
    applicationId, toEmail, subject, body, scheduledFor: nowIso(), createdAt: nowIso(),
  }).run();
}

export function listOutbox() {
  return getDb().select().from(outbox).orderBy(desc(outbox.id)).limit(200).all();
}
