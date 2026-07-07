import { extractPdfText } from "./extractor";
import { detectBank } from "./detect-bank";
import { parseSicredi } from "./parsers/sicredi";
import { parseInfyniti } from "./parsers/infyniti";
import { ParsedStatement } from "./types";

export async function parseBankStatement(
  file: File
): Promise<ParsedStatement> {

  const text = await extractPdfText(file);

  const bank = detectBank(text);
console.log("BANCO DETECTADO:", bank);
  
  switch (bank) {

    case "sicredi":
      return parseSicredi(text);
case "infyniti":
  console.log("ENTROU NO PARSER INFYNITI");
  return parseInfyniti(text);
      
    default:
      throw new Error(`Banco ainda não suportado: ${bank}`);

  }

}
