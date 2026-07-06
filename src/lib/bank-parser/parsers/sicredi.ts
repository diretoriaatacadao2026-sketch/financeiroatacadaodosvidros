import { ParsedStatement, StatementItem } from "../types";

export function parseSicredi(text: string): ParsedStatement {

    const lines = text
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);
for (const line of lines) {

    const valores = line.match(/\-?\d{1,3}(?:\.\d{3})*,\d{2}/g);

    console.log("--------------------------------");

    console.log(line);

    console.log(valores);

}
    console.log("Linhas encontradas:", lines.length);

    return {
        bank: "Sicredi",
        items: [],
        totalCredits: 0,
        totalDebits: 0,
        rawText: text
    };

}
