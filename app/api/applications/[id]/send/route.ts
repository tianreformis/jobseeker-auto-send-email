import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { sendApprovedEmail } from "@/worker/senders/email";
import { markAssistedSent } from "@/worker/senders/assisted";

/** POST /api/applications/:id/send { via: "email"|"assisted" } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = Number(params.id);
  const body = (await req.json().catch(() => ({}))) as { via?: string };
  if (body.via === "assisted") {
    markAssistedSent(id);
    return NextResponse.json({ ok: true, status: "sent", via: "assisted" });
  }
  const r = await sendApprovedEmail(id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, status: "sent", via: "email" });
}
