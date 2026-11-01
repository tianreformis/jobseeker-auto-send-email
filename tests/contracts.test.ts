import { describe, expect, it } from "vitest";
import { matchReplyToApplication } from "@/worker/inbox";

// Behavioral contracts (no network):
// - sender only processes status "approved" (checked in code: sendApprovedEmail refuses otherwise)
// - dryRun never sends (autopilotDecide queues to outbox when isDryRun)
// - max one follow-up per contact (runFollowUps counts followup:sent events vs maxFollowUps)
// - no auto-reply to needsHuman (pollInboxOnce only logs inbox:needs-human, never sends)

describe("inbox matching", () => {
  it("returns null when no headers", () => {
    expect(matchReplyToApplication("", "")).toBeNull();
  });
  it("matches In-Reply-To to stored sent messageId", () => {
    const sent = [{ applicationId: 999, payload: JSON.stringify({ messageId: "<abc123@test>" }) }];
    expect(matchReplyToApplication("<abc123@test>", "<other>", () => sent)).toBe(999);
    expect(matchReplyToApplication("<nomatch>", "<other>", () => sent)).toBeNull();
  });
});
