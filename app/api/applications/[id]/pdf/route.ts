import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getApplication } from "@/lib/db/helpers";
import { htmlToPdf } from "@/lib/pdf";
import path from "node:path";

/** POST /api/applications/:id/pdf -> render CV HTML to PDF, return path. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const app = getApplication(Number(params.id));
  if (!app?.cvVariantPath) return NextResponse.json({ error: "no CV html yet" }, { status: 400 });
  const pdfPath = app.cvVariantPath.replace(/\.html$/, ".pdf");
  try {
    await htmlToPdf(app.cvVariantPath, pdfPath);
    const { updateApplication, logEvent } = await import("@/lib/db/helpers");
    updateApplication(app.id, { cvVariantPath: pdfPath });
    logEvent(app.id, "cv:pdf", { path: path.basename(pdfPath) });
    return NextResponse.json({ ok: true, path: pdfPath });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "pdf gagal" }, { status: 500 });
  }
}
