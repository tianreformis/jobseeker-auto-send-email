// Render CV HTML to ATS-friendly PDF using Playwright Chromium.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

export async function htmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const html = readFileSync(htmlPath, "utf-8");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({ path: pdfPath, format: "A4", printBackground: false });
  } finally {
    await browser.close();
  }
}
