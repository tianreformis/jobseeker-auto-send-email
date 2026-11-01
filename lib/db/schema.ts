import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  externalId: text("external_id"),
  url: text("url").notNull().unique(),
  title: text("title").notNull(),
  company: text("company"),
  description: text("description").notNull(),
  location: text("location"),
  remote: integer("remote", { mode: "boolean" }).notNull().default(true),
  budgetText: text("budget_text"),
  postedAt: text("posted_at"),
  contactEmail: text("contact_email"),
  applyMethod: text("apply_method").notNull().default("unknown"),
  rawJson: text("raw_json"),
  createdAt: text("created_at").notNull(),
});

export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  fitScore: integer("fit_score").notNull(),
  tracks: text("tracks").notNull(),
  matchedSkills: text("matched_skills").notNull(),
  gaps: text("gaps").notNull(),
  redFlags: text("red_flags").notNull(),
  reasoning: text("reasoning").notNull(),
  modelUsed: text("model_used").notNull(),
  createdAt: text("created_at").notNull(),
});

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  status: text("status").notNull().default("new"),
  proposalText: text("proposal_text"),
  cvVariantPath: text("cv_variant_path"),
  coverLetterPath: text("cover_letter_path"),
  emailSubject: text("email_subject"),
  approvedAt: text("approved_at"),
  sentAt: text("sent_at"),
  errorMessage: text("error_message"),
  notes: text("notes"),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull(),
  type: text("type").notNull(),
  payload: text("payload"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const outbox = sqliteTable("outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  scheduledFor: text("scheduled_for"),
  createdAt: text("created_at").notNull(),
});
