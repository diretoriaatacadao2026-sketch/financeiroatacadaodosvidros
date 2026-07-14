import { createWorker } from "tesseract.js";
import { ParsedStatement } from "../types";
import { parseGenericText } from "./generic";
import { detectBank } from "../detect-bank";

/**
 * Handles "print" / screenshot statements (png, jpg, jpeg, webp) via OCR,
 * then reuses the same generic line parser used for PDFs.
 */
export async function parseStatementImage(file: File): Promise<ParsedStatement> {
  const worker = await createWorker("por");
  try {
    const { data } = await worker.recognize(file);
    const text = data.text;
    const bank = detectBank(text);
    return parseGenericText(text, bank === "generic" ? null : bank);
  } finally {
    await worker.terminate();
  }
}
