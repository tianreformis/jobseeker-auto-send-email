// Master profile loader + TODO detection (dashboard warning).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROFILE_PATH = path.join(process.cwd(), "data", "profile.json");

export function loadProfile(): Record<string, unknown> {
  const raw = readFileSync(PROFILE_PATH, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

export function saveProfile(data: unknown): void {
  writeFileSync(PROFILE_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/** Find all leaf paths whose value contains "TODO". */
export function findTodos(obj: unknown, prefix = ""): string[] {
  const out: string[] = [];
  if (typeof obj === "string") {
    if (obj.includes("TODO")) out.push(prefix || "(root)");
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...findTodos(v, `${prefix}[${i}]`)));
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      out.push(...findTodos(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}
