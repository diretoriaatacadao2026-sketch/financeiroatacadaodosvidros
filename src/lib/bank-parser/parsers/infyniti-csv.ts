import {
  ParsedStatement,
  ParsedStatementItem,
} from "../types";

function money(v: string): number {
  return Number(
    v
      .replace(/"/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
}

function paymentMethod(meio: string) {

  const m = meio.toLowerCase();

  if (m.includes("pix"))
    return "pix";

  if (
    m.includes("débito") ||
    m.includes("debito") ||
    m.includes("dÃ©bito")
  )
    return "cartao_debito";

  return "cartao_credito";
}

export function parseInfynitiCsv(csv: string): ParsedStatement {

  const items: ParsedStatementItem[] = [];

  const lines = csv
    .split(/\r?\n/)
    .filter(l => l.trim());

  if (lines.length <= 1)
    return {
      raw_text: csv,
      items: [],
      total_credits: 0,
      total_debits: 0,
      bank_hint: "Infyniti",
    };

  // pula cabeçalho
  for (let i = 1; i < lines.length; i++) {

    const c = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);

    if (!c || c.length < 10)
      continue;

    const status = c[7].replace(/"/g, "").trim();

    if (status !== "Aprovada")
      continue;

    items.push({

      item_date: c[0].substring(6,10) + "-" +
                 c[0].substring(3,5) + "-" +
                 c[0].substring(0,2),

      description: c[1].replace(/"/g,""),

      amount: money(c[8]),

      direction: "credit",

      inferred_payment_method: paymentMethod(c[1]),

      balance: 0

    });

  }

  return {

    raw_text: csv,

    items,

    total_credits: items.reduce((s,i)=>s+i.amount,0),

    total_debits:0,

    bank_hint:"Infyniti"

  };

}
