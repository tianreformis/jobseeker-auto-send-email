// Structured LLM output schemas (Zod-validated).
import { z } from "zod";

export const ScoreSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  track: z.enum(["web", "ai", "both"]).default("both"),
  matchedSkills: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  redFlags: z.array(z.string()).default([]),
  reasoning: z.string().max(600).default(""),
});
export type Score = z.infer<typeof ScoreSchema>;

export const DraftSchema = z.object({
  subject: z.string().min(1).max(200),
  proposal: z.string().min(50).max(3000),
  coverLetter: z.string().min(1).max(3000),
});
export type Draft = z.infer<typeof DraftSchema>;

export const ExtractSchema = z.object({
  title: z.string().nullable().default(null),
  company: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  budgetText: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  remote: z.boolean().nullable().default(true),
  contactEmail: z.string().nullable().default(null),
  applyMethod: z.enum(["email", "platform", "unknown"]).nullable().default("unknown"),
  language: z.enum(["id", "en", "other"]).nullable().default(null),
});
export type Extract = z.infer<typeof ExtractSchema>;

export const FactCheckSchema = z.object({
  pass: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  placeholders: z.array(z.string()),
  issues: z.array(z.string()),
});
export type FactCheck = z.infer<typeof FactCheckSchema>;

export const ReplyClassSchema = z.object({
  category: z.enum(["interview", "question", "rejection", "auto_reply", "other"]),
  summary: z.string().max(300),
  needsHuman: z.boolean(),
});
export type ReplyClass = z.infer<typeof ReplyClassSchema>;

export const APPLICATION_STATUSES = [
  "new", "drafted", "approved", "sent", "replied",
  "interview", "rejected", "skipped", "failed", "no_response",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
