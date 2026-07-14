import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - worker as URL
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

interface TextItem {
  str: string;
  transform: number[];
}

/**
 * Reconstructs visual lines from pdf.js text items.
 * pdf.js returns one item per text run (often per word), NOT per line,
 * so items must be grouped by their y-coordinate and sorted by x
 * before being joined — otherwise every word ends up on its own line
 * and every column-based parser (bank statements are tables) breaks.
 */
function itemsToLines(items: TextItem[]): string {
  const rows = new Map<number, { x: number; str: string }[]>();

  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push({ x, str: item.str });
  }

  // PDF y-coordinates grow upward, so sort descending to read top -> bottom
  const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);

  const lines: string[] = [];
  for (const y of sortedY) {
    const rowItems = rows.get(y)!.sort((a, b) => a.x - b.x);
    let line = "";
    let lastX: number | null = null;
    for (const { x, str } of rowItems) {
      if (lastX !== null && x - lastX > 1.5 && !line.endsWith(" ") && !str.startsWith(" ")) {
        line += " ";
      }
      line += str;
      lastX = x + str.length * 3; // rough width estimate, only used for spacing heuristics
    }
    const trimmed = line.replace(/\s+/g, " ").trim();
    if (trimmed) lines.push(trimmed);
  }

  return lines.join("\n");
}

export async function extractPdfText(file: File): Promise<string> {

  const buffer = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data: buffer,
  }).promise;

  let text = "";

  for (let page = 1; page <= pdf.numPages; page++) {

    const p = await pdf.getPage(page);

    const content = await p.getTextContent();

    text += itemsToLines(content.items as TextItem[]);

    text += "\n";

  }

  return text;

}
