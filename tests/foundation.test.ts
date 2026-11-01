import { describe, expect, it } from "vitest";
import { findTodos } from "@/lib/profile";
import { ScoreSchema } from "@/lib/schemas";

describe("foundation", () => {
  it("detects TODOs in profile", () => {
    expect(findTodos({ a: "TODO", b: { c: "ok" } })).toEqual(["a"]);
  });
  it("rejects out-of-range score", () => {
    const r = ScoreSchema.safeParse({
      fitScore: 150, track: "web", matchedSkills: [], gaps: [], redFlags: [], reasoning: "x",
    });
    expect(r.success).toBe(false);
  });
});
