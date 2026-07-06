import { ParsedStatement, StatementItem } from "../types";

export function parseSicredi(text: string): ParsedStatement {

    const lines = text
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    console.log("Linhas encontradas:", lines.length);

    return {
        bank: "Sicredi",
        items: [],
        totalCredits: 0,
        totalDebits: 0,
        rawText: text
    };

}
