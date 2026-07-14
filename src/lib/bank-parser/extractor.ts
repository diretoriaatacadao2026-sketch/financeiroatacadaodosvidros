import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - worker as URL
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractPdfText(file: File): Promise<string> {

  const buffer = await file.arrayBuffer();

  const pdf = await pdfjs.getDocument({
    data: buffer,
  }).promise;

  let text = "";

  for (let page = 1; page <= pdf.numPages; page++) {

    const p = await pdf.getPage(page);

    const content = await p.getTextContent();

    text += (content.items as any[])
      .map((item) => item.str)
      .join("\n");

    text += "\n";

  }

  return text;

}
