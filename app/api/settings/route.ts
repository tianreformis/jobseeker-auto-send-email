import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSetting, setSetting, listOutbox } from "@/lib/db/helpers";

/** GET /api/settings -> mode, dry_run, kill, outbox count. */
export async function GET() {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    mode: getSetting("mode", "review"),
    dry_run: getSetting("dry_run", "true"),
    kill: getSetting("kill", "false"),
    outbox: listOutbox().length,
  });
}

/**
 * POST /api/settings { action }
 * - enable_autopilot { confirm: true }: requires explicit confirmation; always starts with dryRun=true.
 * - end_dry_run { confirm: true }: explicit click to start real sending.
 * - kill: instant pause (dashboard kill switch).
 * - resume: clear kill (stays in review mode).
 */
export async function POST(req: NextRequest) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { action?: string; confirm?: boolean };
  if (body.action === "enable_autopilot") {
    if (body.confirm !== true) return NextResponse.json({ error: "butuh confirm:true eksplisit" }, { status: 400 });
    setSetting("mode", "autopilot");
    setSetting("dry_run", "true"); // always start with dryRun
    setSetting("kill", "false");
    const { logEvent } = await import("@/lib/db/helpers");
    logEvent(0, "mode:autopilot", { actor: "user", dryRun: true });
    return NextResponse.json({ ok: true, mode: "autopilot", dry_run: true });
  }
  if (body.action === "end_dry_run") {
    if (body.confirm !== true) return NextResponse.json({ error: "butuh confirm:true eksplisit" }, { status: 400 });
    setSetting("dry_run", "false");
    return NextResponse.json({ ok: true, dry_run: false });
  }
  if (body.action === "kill") {
    setSetting("kill", "true");
    setSetting("mode", "review");
    return NextResponse.json({ ok: true, kill: true });
  }
  if (body.action === "resume") {
    setSetting("kill", "false");
    return NextResponse.json({ ok: true, kill: false });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
