import { describe, expect, it } from "vitest";
import {
  gateCapsWindow, gateDomain, gateEmailMethod, gateNoRecentContact,
  gateProfileCompleteFor, gateScore,
} from "@/worker/autopilot/gates";
import { checkCaps, inSendWindow } from "@/lib/ratelimit";
import { isValidEmail, jobHash, keywordPass, normalizeUrl, wordCount } from "@/lib/normalize";

describe("normalize + dedupe", () => {
  it("strips tracking params and lowercases", () => {
    expect(normalizeUrl("https://Example.com/job/1?utm_source=x#frag")).toBe("https://example.com/job/1");
  });
  it("same title+company -> same hash", () => {
    expect(jobHash("Dev", "Acme")).toBe(jobHash(" dev ", "acme"));
  });
  it("different company -> different hash", () => {
    expect(jobHash("Dev", "A")).not.toBe(jobHash("Dev", "B"));
  });
});

describe("keyword filter", () => {
  it("passes on include keyword", () => {
    expect(keywordPass("Next.js dev", "build react app").pass).toBe(true);
  });
  it("blocks exclude keyword", () => {
    expect(keywordPass("Next.js dev", "wordpress-only site").pass).toBe(false);
  });
  it("blocks when no include keyword", () => {
    expect(keywordPass("Driver needed", "drive car daily").pass).toBe(false);
  });
});

describe("email + words", () => {
  it("validates email syntax", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
  it("counts words", () => {
    expect(wordCount("  a b  c ")).toBe(3);
  });
});

describe("caps + window", () => {
  it("blocks at daily cap", () => {
    expect(checkCaps(5, 0)).toContain("daily");
  });
  it("blocks at hourly cap", () => {
    expect(checkCaps(0, 2)).toContain("hourly");
  });
  it("allows under caps", () => {
    expect(checkCaps(1, 0)).toBeNull();
  });
  it("send window is boolean", () => {
    expect(typeof inSendWindow(new Date("2026-01-05T02:00:00Z"))).toBe("boolean");
  });
});

describe("autopilot gates (one failing test per gate)", () => {
  it("gate1 fails for platform jobs", () => {
    expect(gateEmailMethod({ applyMethod: "platform", contactEmail: null }).failedGate).toBe("gate1");
  });
  it("gate1 passes for valid email job", () => {
    expect(gateEmailMethod({ applyMethod: "email", contactEmail: "a@b.co" }).pass).toBe(true);
  });
  it("gate2 fails below autoThreshold", () => {
    expect(gateScore(70, []).failedGate).toBe("gate2");
  });
  it("gate2 fails on red flags", () => {
    expect(gateScore(95, ["unpaid test"]).failedGate).toBe("gate2");
  });
  it("gate4 fails when profile has TODO in used fields", () => {
    expect(gateProfileCompleteFor({ email: "TODO isi email" }).failedGate).toBe("gate4");
  });
  it("gate4 passes when profile has no TODO", () => {
    expect(gateProfileCompleteFor({ email: "a@b.co", rate: { hourlyMin: 6 } }).pass).toBe(true);
  });
  it("gate6 fails outside caps", () => {
    expect(gateCapsWindow(5, 0).failedGate).toBe("gate6");
  });
  it("gate7 fails for empty domain", () => {
    expect(gateDomain("not-an-email").failedGate).toBe("gate7");
  });
  it("gate5 passes with no history (fresh db)", () => {
    expect(gateNoRecentContact("Nobody Inc", "nobody@example.com").pass).toBe(true);
  });
});
