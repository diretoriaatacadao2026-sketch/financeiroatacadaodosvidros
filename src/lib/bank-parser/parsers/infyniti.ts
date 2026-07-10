import {
  ParsedStatement,
  ParsedStatementItem,
} from "../types";

function parseMoney(value: string): number {
  return Number(
    value
      .replace(/[R$\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
  );
}

export function parseInfyniti(text: string): ParsedStatement {

  const items: ParsedStatementItem[] = [];

  const regex =
    const regex =
  /(\d{2})\s+(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez),\s+(\d{4}).*?(Pix|Débito|Crédito).*?Aprovada\s+\+\s*([\d.,]+)\s+\+\s*([\d.,]+)/gsi;

  let match;

  while ((match = regex.exec(text)) !== null) {

    const dia = match[1];
const mesTxt = match[2];
const ano = match[3];
const tipo = match[4];
const bruto = match[5];

const meses: Record<string, string> = {
  Jan: "01",
  Fev: "02",
  Mar: "03",
  Abr: "04",
  Mai: "05",
  Jun: "06",
  Jul: "07",
  Ago: "08",
  Set: "09",
  Out: "10",
  Nov: "11",
  Dez: "12",
};

const mes = meses[mesTxt] ?? "01";

    items.push({

      item_date: `${ano}-06-${dia.padStart(2,"0")}`,

      description: tipo.toUpperCase(),

      amount: parseMoney(bruto),

      direction: "credit",

      inferred_payment_method:
        tipo === "Pix"
          ? "pix"
          : tipo === "Débito"
          ? "cartao_debito"
          : "cartao_credito",

      balance: 0

    });

  }

  return {

    raw_text: text,

    items,

    total_credits: items.reduce((s,i)=>s+i.amount,0),

    total_debits:0,

    bank_hint:"Infyniti"

  };

}
