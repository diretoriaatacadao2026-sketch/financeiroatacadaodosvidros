import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

(pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractPdfText(file: File): Promise<string> {

    const buffer = await file.arrayBuffer();

    const pdf = await pdfjs.getDocument({
        data: buffer
    }).promise;

    let text = "";

    for (let page = 1; page <= pdf.numPages; page++) {

        const p = await pdf.getPage(page);

        const content = await p.getTextContent();

        const rows: Record<number, any[]> = {};

        for (const item of content.items as any[]) {

            const y = Math.round(item.transform[5]);

            rows[y] ??= [];

            rows[y].push(item);

        }

        const sorted = Object.keys(rows)
            .map(Number)
            .sort((a, b) => b - a);

        for (const y of sorted) {

            const row = rows[y]
                .sort((a, b) => a.transform[4] - b.transform[4])
                .map(i => i.str)
                .join(" ");

            text += row + "\n";

        }

    }

    return text;

}
