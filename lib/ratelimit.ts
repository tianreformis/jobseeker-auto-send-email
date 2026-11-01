// Rate limits + send-window checks (pure functions for testability).
import { config } from "@/config";

/** True if now is inside the configured send window (tz-aware via Intl). */
export function inSendWindow(now = new Date()): boolean {
  const tz = config.sendWindow.tz;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
  });
  const hm = fmt.format(now); // "HH:MM"
  return hm >= config.sendWindow.start && hm <= config.sendWindow.end;
}

/** Random jitter between min and max ms. */
export function sendJitterMs(): number {
  const { sendJitterMinMs, sendJitterMaxMs } = config;
  return Math.floor(sendJitterMinMs + Math.random() * (sendJitterMaxMs - sendJitterMinMs));
}

/** Check daily/hourly caps. Returns null if allowed, else reason string. */
export function checkCaps(sentToday: number, sentThisHour: number): string | null {
  if (sentToday >= config.maxPerDay) return `daily cap reached (${config.maxPerDay}/day)`;
  if (sentThisHour >= config.maxPerHour) return `hourly cap reached (${config.maxPerHour}/hour)`;
  return null;
}
