// Simple signed-cookie session auth for the dashboard.
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "jh_session";

function secret(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-change-me-0123456789";
}

export function createSessionToken(): string {
  const sig = createHmac("sha256", secret()).update("ok").digest("hex");
  return `ok.${sig}`;
}

export function isAuthenticated(): boolean {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return false;
  const expected = createSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setSession(): void {
  cookies().set(COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSession(): void {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

export function checkPassword(input: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expected) return true; // localhost dev without password
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
