import {
  ParsedStatement,
  ParsedStatementItem,
} from "../types";

function parseMoney(value: string): number {
  return Number(
    value
      .replace(/\./g, "")
      .replace(",", ".")
  );
}

export function parseSicredi(text: string): ParsedStatement {

  const items: ParsedStatementItem[] = [];

  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const regex =
    /^(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/;

  for (const line of lines) {

    const m = line.match(regex);

    if (!m) continue;

    const [, data, descricao, valor, saldo] = m;

    const amount = parseMoney(valor);

    items.push({
      item_date: data.split("/").reverse().join("-"),
      description: descricao.trim(),
      amount: Math.abs(amount),
      direction: amount < 0 ? "debit" : "credit",
      inferred_payment_method:
        descricao.toUpperCase().includes("PIX")
          ? "pix"
          : null,
      balance: parseMoney(saldo),
    });

  }

  return {

    raw_text: text,

    items,

    total_credits: items
      .filter(i => i.direction === "credit")
      .reduce((s, i) => s + i.amount, 0),

    total_debits: items
      .filter(i => i.direction === "debit")
      .reduce((s, i) => s + i.amount, 0),

    bank_hint: "Sicredi",

  };

}
