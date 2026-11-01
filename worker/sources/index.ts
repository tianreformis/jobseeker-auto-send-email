// JobSource interface + implementations. Verified 2026-10-30:
// - Remotive: GET https://remotive.com/api/remote-jobs?category=software-dev (live; requires
//   link-back to remotive.com URL + mention "Remotive"; max ~4 req/day; jobs delayed 24h).
// - RemoteOK: GET https://remoteok.com/api (live; requires follow link-back + mention "Remote OK").
// - We Work Remotely: https://weworkremotely.com/categories/remote-programming-jobs.rss (RSS).
// - HN hiring: Algolia https://hn.algolia.com/api/v1/search?query=...&tags=story (public, rate-limited).
// - Freelancer.com: official API only if FREELANCER_TOKEN set (verified at runtime).

export interface RawJob {
  source: string;
  externalId?: string;
  url?: string;
  title: string;
  company?: string | null;
  description: string;
  location?: string | null;
  remote?: boolean;
  budgetText?: string | null;
  postedAt?: string | null;
  contactEmail?: string | null;
  applyMethod?: "email" | "platform" | "unknown";
}

export interface JobSource {
  id: string;
  fetch(): Promise<RawJob[]>;
}

/** Random polite delay between requests (respects rate limits/ToS). */
export async function politeDelay(minMs = 1500, maxMs = 4000): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  await new Promise((r) => setTimeout(r, ms));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export class RemotiveSource implements JobSource {
  id = "remotive";
  async fetch(): Promise<RawJob[]> {
    // Attribution: link back to job URL + mention Remotive (see API legal notice).
    const res = await fetch("https://remotive.com/api/remote-jobs?category=software-dev&limit=50", {
      headers: { "User-Agent": "JobHunter/1.0 (personal use)" },
    });
    if (!res.ok) throw new Error(`remotive http ${res.status}`);
    const data = (await res.json()) as {
      jobs: Array<{
        id: number; url: string; title: string; company_name: string;
        description: string; candidate_required_location: string;
        publication_date: string; salary?: string;
      }>;
    };
    return data.jobs.map((j) => ({
      source: "remotive (via Remotive)",
      externalId: String(j.id),
      url: j.url,
      title: j.title,
      company: j.company_name,
      description: `${stripHtml(j.description).slice(0, 6000)}\n\nSumber: Remotive — ${j.url}`,
      location: j.candidate_required_location,
      remote: true,
      budgetText: j.salary ?? null,
      postedAt: j.publication_date,
      applyMethod: "platform" as const,
    }));
  }
}

export class RemoteOKSource implements JobSource {
  id = "remoteok";
  async fetch(): Promise<RawJob[]> {
    // Attribution: follow link-back to remoteok.com URL + mention "Remote OK" (API ToS).
    const res = await fetch("https://remoteok.com/api?tag=javascript", {
      headers: { "User-Agent": "JobHunter/1.0 (personal use)" },
    });
    if (!res.ok) throw new Error(`remoteok http ${res.status}`);
    const data = (await res.json()) as Array<{
      slug?: string; id?: string; company?: string; position?: string;
      description?: string; location?: string; salary_min?: number; salary_max?: number;
      date?: string; url?: string; apply_url?: string;
    }>;
    return data.filter((j) => j.position).slice(0, 50).map((j) => {
      const url = j.url ?? (j.slug ? `https://remoteok.com/${j.slug}` : undefined);
      return {
        source: "remoteok (via Remote OK)",
        externalId: j.id ? String(j.id) : j.slug,
        url,
        title: j.position ?? "(no title)",
        company: j.company ?? null,
        description: `${stripHtml(j.description ?? "").slice(0, 6000)}\n\nSumber: Remote OK — ${url ?? ""}`,
        location: j.location ?? "Remote",
        remote: true,
        budgetText: j.salary_min || j.salary_max ? `$${j.salary_min ?? "?"}-$${j.salary_max ?? "?"}` : null,
        postedAt: j.date ?? null,
        applyMethod: "platform" as const,
      };
    });
  }
}

export class WWRSource implements JobSource {
  id = "wwr";
  async fetch(): Promise<RawJob[]> {
    const res = await fetch("https://weworkremotely.com/categories/remote-programming-jobs.rss", {
      headers: { "User-Agent": "JobHunter/1.0 (personal use)" },
    });
    if (!res.ok) throw new Error(`wwr http ${res.status}`);
    const xml = await res.text();
    const items: RawJob[] = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    const tag = (s: string, t: string) => {
      const mm = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`).exec(s);
      return mm?.[1]?.trim().replace("<![CDATA[", "").replace("]]>", "") ?? "";
    };
    while ((m = re.exec(xml)) && items.length < 50) {
      const body = m[1] ?? "";
      const title = tag(body, "title");
      const link = tag(body, "link");
      items.push({
        source: "wwr", title, url: link || undefined,
        description: stripHtml(tag(body, "description")).slice(0, 6000),
        location: "Remote", remote: true, postedAt: tag(body, "pubDate") || null,
        applyMethod: "platform",
      });
    }
    return items;
  }
}

export class HackerNewsSource implements JobSource {
  id = "hn";
  async fetch(): Promise<RawJob[]> {
    // Latest "Who is hiring" / freelancer threads via Algolia (public API, be gentle).
    const res = await fetch(
      "https://hn.algolia.com/api/v1/search?query=who%20is%20hiring&tags=story&hitsPerPage=3",
      { headers: { "User-Agent": "JobHunter/1.0 (personal use)" } },
    );
    if (!res.ok) throw new Error(`hn http ${res.status}`);
    const data = (await res.json()) as { hits: Array<{ objectID: string; title: string; url?: string; created_at: string }> };
    return data.hits.map((h) => ({
      source: "hn",
      externalId: h.objectID,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: h.title,
      description: `HN hiring thread: ${h.title}. Buka thread untuk komentar individu (intake manual per komentar yang cocok).`,
      remote: true,
      postedAt: h.created_at,
      applyMethod: "platform" as const,
    }));
  }
}

export class FreelancerSource implements JobSource {
  id = "freelancer";
  async fetch(): Promise<RawJob[]> {
    const token = process.env.FREELANCER_TOKEN;
    if (!token) {
      console.log("freelancer: FREELANCER_TOKEN tidak diset — sumber dilewati.");
      return [];
    }
    // Official API (oauth). Kept minimal; enable automation only after ToS verification.
    const res = await fetch("https://www.freelancer.com/api/projects/0.1/projects/active?limit=20&job_details=true", {
      headers: { Authorization: `OAuth ${token}`, "User-Agent": "JobHunter/1.0" },
    });
    if (!res.ok) throw new Error(`freelancer http ${res.status}`);
    const data = (await res.json()) as {
      result?: { projects?: Array<{ id: number; title: string; preview_description: string; url: string; budget?: { minimum?: number; maximum?: number; currency?: { code?: string } }; submitdate?: string }> };
    };
    return (data.result?.projects ?? []).map((p) => ({
      source: "freelancer",
      externalId: String(p.id),
      url: p.url,
      title: p.title,
      description: stripHtml(p.preview_description ?? "").slice(0, 6000),
      remote: true,
      budgetText: p.budget ? `${p.budget.minimum ?? "?"}-${p.budget.maximum ?? "?"} ${p.budget.currency?.code ?? ""}` : null,
      postedAt: p.submitdate ? new Date(p.submitdate).toISOString() : null,
      applyMethod: "platform" as const,
    }));
  }
}

export const ALL_SOURCES: JobSource[] = [
  new RemotiveSource(), new RemoteOKSource(), new WWRSource(),
  new HackerNewsSource(), new FreelancerSource(),
];
