import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isAutopilot } from "@/lib/db/helpers";
import { draftForApplication, editProposal } from "@/worker/pipeline/draft";
import { getApplication, logEvent, nowIso, setAppStatus, updateApplication } from "@/lib/db/helpers";

/** POST /api/applications/:id/draft { guidance? } -> generate proposal + CV html. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(params.id);
  try {
    const body = (await req.json().catch(() => ({}))) as { guidance?: string; proposalText?: string };
    if (body.proposalText !== undefined) {
      editProposal(id, body.proposalText.slice(0, 10_000));
      return NextResponse.json({ ok: true });
    }
    await draftForApplication(id, body.guidance ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "gagal" }, { status: 500 });
  }
}

/** PATCH /api/applications/:id { action: approve|skip, reason? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(params.id);
  const app = getApplication(id);
  if (!app) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json()) as { action: string; reason?: string };
  if (body.action === "approve") {
    // HARD RULE: in review mode, approval only via this dashboard click (authenticated user).
    // In autopilot, auto-approve path (stage 7) calls the same guard with actor:"autopilot".
    if (isAutopilot()) {
      return NextResponse.json({ error: "mode autopilot: gunakan gerbang auto-approve" }, { status: 403 });
    }
    updateApplication(id, { status: "approved", approvedAt: nowIso() });
    logEvent(id, "status:approved", { actor: "user", reason: body.reason ?? "dashboard click" });
    return NextResponse.json({ ok: true, status: "approved" });
  }
  if (body.action === "skip") {
    setAppStatus(id, "skipped", body.reason ?? "user skipped");
    return NextResponse.json({ ok: true, status: "skipped" });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
