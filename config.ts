// Central configuration. Secrets come from .env only; this file holds safe defaults.
export type OperationMode = "review" | "autopilot";
export type AutomationLevel = "manual_only" | "assisted" | "email" | "api";

export const config = {
  mode: (process.env.JH_MODE as OperationMode) ?? "review",
  dryRunDays: 3,
  reviewThreshold: 70,
  autoThreshold: 85,
  maxPerDay: 5,
  maxPerHour: 2,
  sendWindow: { start: "08:00", end: "17:00", tz: "Asia/Makassar" },
  sendJitterMinMs: 3 * 60_000,
  sendJitterMaxMs: 15 * 60_000,
  followUpAfterDays: 5,
  maxFollowUps: 1,
  blocklist: [] as string[],
  keywords: {
    include: [
      "next.js", "nextjs", "react", "typescript", "node", "python",
      "llm", "ai agent", "rag", "automation", "chatbot", "freelance",
      "javascript", "full-stack", "fullstack", "frontend", "backend",
      "flutter", "api", "developer", "engineer", "programmer",
    ],
    exclude: ["wordpress-only", "php-only", "unpaid", "unpaid test", "commission-only", "mlm", "forex deposit"],
  },
  platforms: {
    linkedin: { automation: "manual_only" as AutomationLevel },
    upwork: { automation: "manual_only" as AutomationLevel },
    fiverr: { automation: "manual_only" as AutomationLevel },
    sribulancer: { automation: "assisted" as AutomationLevel },
    "projects.co.id": { automation: "assisted" as AutomationLevel },
    freelancer: { automation: "manual_only" as AutomationLevel },
    email: { automation: "email" as AutomationLevel },
  } as Record<string, { automation: AutomationLevel }>,
  schedule: { fetchCron: "0 7 * * *", fetchMiddayCron: "0 13 * * *", inboxCron: "*/15 * * * *", digestCron: "0 18 * * *" },
} as const;

export type AppConfig = typeof config;
