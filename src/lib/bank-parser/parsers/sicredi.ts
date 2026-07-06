import { ParsedStatement, BankTransaction } from "../types";

function parseMoney(value: string): number {
  return Number(
    value
      .replace(/\./g, "")
      .replace(",", ".")
  );
}

export function parseSicredi(text: string): ParsedStatement {

  const transactions: BankTransaction[] = [];

  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  const regex =
    /^(\d{2}\/\d{2}\/\d{4})\s+(.*?)(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/;

  for (const line of lines) {

    const match = line.match(regex);

    if (!match) continue;

    const [
      ,
      data,
      descricao,
      valor,
      saldo
    ] = match;

    const amount = parseMoney(valor);

    const transaction: BankTransaction = {

      date: data.split("/").reverse().join("-"),

      description: descricao.trim(),

      amount: Math.abs(amount),

      balance: parseMoney(saldo),

      type: amount < 0 ? "debit" : "credit",

      paymentMethod:
        descricao.toUpperCase().includes("PIX")
          ? "pix"
          : "desconhecido",

      rawLine: line

    };

    transactions.push(transaction);

  }

  return {

    bank: "sicredi",

    transactions,

    totalCredits: transactions
      .filter(t => t.type === "credit")
      .reduce((s, t) => s + t.amount, 0),

    totalDebits: transactions
      .filter(t => t.type === "debit")
      .reduce((s, t) => s + t.amount, 0)

  };

}
