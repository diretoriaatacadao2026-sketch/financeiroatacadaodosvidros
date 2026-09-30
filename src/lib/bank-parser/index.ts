import { parseRedeCsv } from "./parsers/rede-csv";
import { extractPdfText } from "./extractor";
import { detectBank } from "./detect-bank";
import { parseSicredi } from "./parsers/sicredi";
import { parseInfyniti } from "./parsers/infyniti";
import { ParsedStatement } from "./types";
import { parseInfynitiCsv } from "./parsers/infyniti-csv";
import { parseGenericCsv } from "./parsers/generic-csv";
import { parseGenericText } from "./parsers/generic";
import { parseStatementImage } from "./parsers/image-ocr";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

export async function parseBankStatement(file: File): Promise<ParsedStatement> {
  const name = file.name.toLowerCase();
  const isImage = file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
  const isCsv = file.type === "text/csv" || name.endsWith(".csv");

  // Prints / screenshots do extrato (OCR)
  if (isImage) {
    return parseStatementImage(file);
  }

  // Extratos exportados em CSV
  if (isCsv) {
    // Bancos/maquininhas costumam exportar CSV em Latin-1 (Windows) e/ou com BOM.
    // Ler só como UTF-8 quebra os acentos dos cabeçalhos ("Data da Venda",
    // "Débito"...) e nenhum parser reconhece as colunas.
    const buf = await file.arrayBuffer();
    let csv = new TextDecoder("utf-8").decode(buf);
    if (csv.includes("\uFFFD")) csv = new TextDecoder("windows-1252").decode(buf);
    csv = csv.replace(/^\uFEFF/, "");
    const csvLower = csv.toLowerCase();

    // InfinitePay
    if (
      csvLower.includes("taxa aplicada") &&
      csvLower.includes("status") &&
      csvLower.includes("plano")
    ) {
      return parseInfynitiCsv(csv);
    }

    // Rede
    try {
      return parseRedeCsv(csv);
    } catch {
      // Layout desconhecido: tenta o parser genérico por cabeçalho
      return parseGenericCsv(csv);
    }
  }

  // PDF
  const text = await extractPdfText(file);
  const bank = detectBank(text);

  switch (bank) {
    case "sicredi":
      return parseSicredi(text);

    case "infyniti":
      return parseInfyniti(text);

    default:
      // Itaú, Bradesco, BB, Santander, Caixa, Nubank, Inter e outros:
      // usa o parser genérico de extrato (valores lidos exatamente como
      // impressos no extrato, ou seja, valor bruto).
      return parseGenericText(text, bank === "generic" ? null : bank);
  }
}
