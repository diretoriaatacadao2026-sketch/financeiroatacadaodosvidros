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
    /(\d{2})\s+Jun,\s+(\d{4}).*?(Pix|Débito|Crédito).*?Aprovada\s+\+\s*([\d.,]+)\s+\+\s*([\d.,]+)/gs;

  let match;

  while ((match = regex.exec(text)) !== null) {

    const dia = match[1];
    const ano = match[2];
    const tipo = match[3];
    const bruto = match[4];
    const liquido = match[5];

    items.push({

      item_date: `${ano}-06-${dia.padStart(2,"0")}`,

      description: tipo.toUpperCase(),

      amount: parseMoney(liquido),

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
