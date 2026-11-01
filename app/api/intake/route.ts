import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { processIntake } from "@/worker/pipeline/intake";

/** POST /api/intake { source, url?, rawText } -> pipeline result. */
export async function POST(req: NextRequest) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = (await req.json()) as { source?: string; url?: string; rawText?: string };
    const result = await processIntake({
      source: body.source?.slice(0, 60) || "manual",
      url: body.url?.slice(0, 2000) || undefined,
      rawText: body.rawText ?? "",
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gagal memproses";
    const status = msg.includes("terlalu") || msg.includes("tidak valid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
