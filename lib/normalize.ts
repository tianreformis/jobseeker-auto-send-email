// URL normalization, job hashing, keyword pre-filter (pure, unit-tested).
import { createHash } from "node:crypto";
import { config } from "@/config";

/** Normalize URL for dedupe: lowercase host, strip tracking params, hash, trailing slash. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    const tracking = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    for (const p of tracking) u.searchParams.delete(p);
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Dedupe hash from title + company. */
export function jobHash(title: string, company: string | null): string {
  const norm = `${title.trim().toLowerCase()}|${(company ?? "").trim().toLowerCase()}`;
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

/** Keyword pre-filter before LLM (saves cost). Returns { pass, reason }. */
export function keywordPass(title: string, description: string): { pass: boolean; reason: string } {
  const hay = `${title}\n${description}`.toLowerCase();
  const { include, exclude } = config.keywords;
  for (const ex of exclude) {
    if (ex && hay.includes(ex.toLowerCase())) return { pass: false, reason: `excluded:${ex}` };
  }
  const hit = include.some((k) => k && hay.includes(k.toLowerCase()));
  if (!hit) return { pass: false, reason: "no-include-keyword" };
  return { pass: true, reason: "ok" };
}

/** Validate contact email format (syntax only; MX check is in mailer). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** Count words in proposal text. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
