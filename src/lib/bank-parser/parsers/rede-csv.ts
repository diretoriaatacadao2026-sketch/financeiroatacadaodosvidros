import { ParsedStatement, ParsedStatementItem } from "../types";

function parseMoney(value: string): number {
  return Number(
    (value || "0")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
}

export function parseRedeCsv(csv: string): ParsedStatement {

  const linhas = csv
    .split(/\r?\n/)
    .filter(l => l.trim());

  const header = linhas[0].split(";");

  const idxData = header.indexOf("data da venda");
  const idxValor = header.indexOf("valor da venda original");
  const idxModalidade = header.indexOf("modalidade");
  const idxNSU = header.indexOf("NSU/CV");

  if (
    idxData === -1 ||
    idxValor === -1 ||
    idxModalidade === -1
  ) {
    throw new Error("Layout do CSV da Rede não reconhecido.");
  }

  const items: ParsedStatementItem[] = [];

  for (let i = 1; i < linhas.length; i++) {

    const col = linhas[i].split(";");

    const data = col[idxData];

    if (!data) continue;

    items.push({

      item_date: data.split("/").reverse().join("-"),

      description: `${col[idxModalidade]} ${col[idxNSU] ?? ""}`.trim(),

      amount: parseMoney(col[idxValor]),

      direction: "credit",

      inferred_payment_method:
        col[idxModalidade]?.toLowerCase().includes("pix")
          ? "pix"
          : col[idxModalidade]?.toLowerCase().includes("débito") ||
            col[idxModalidade]?.toLowerCase().includes("debito")
          ? "cartao_debito"
          : "cartao_credito",

    });

  }

  return {

    raw_text: csv,

    items,

    total_credits: items.reduce((s, i) => s + i.amount, 0),

    total_debits: 0,

    bank_hint: "rede"

  };

}
