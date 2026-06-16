// cvParse.ts — Extracción real de texto del CV en el cliente (PDF vía pdfjs-dist).
// DOCX no se parsea aquí; el candidato puede pegar el texto manualmente.

import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 8;

export async function extractCvText(file: File): Promise<string> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "";
  try {
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages = Math.min(pdf.numPages, MAX_PAGES);
    let text = "";
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items
        .map((item) => (typeof item === "object" && item && "str" in item ? String((item as { str: string }).str) : ""))
        .join(" ") + "\n";
    }
    return text.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
