import { ParsedStatement, ParsedStatementItem } from "../types";

function money(v: string): number {
  return Number(
    String(v)
      .replace(/"/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
}

function paymentMethod(modalidade: string) {
  const m = modalidade.toLowerCase();

  if (m.includes("pix")) return "pix";
  if (m.includes("débito") || m.includes("debito")) return "cartao_debito";
  if (m.includes("crédito") || m.includes("credito")) return "cartao_credito";

  return null;
}

export function parseRedeCsv(csv: string): ParsedStatement {

  const linhas = csv.split(/\r?\n/);

  if (linhas.length < 2)
    throw new Error("CSV vazio.");

  const cab = linhas[0].split(",");
console.log(cab);
  
  const idxData = cab.indexOf("data da venda");
  const idxValor = cab.indexOf("valor da venda original");
  const idxLiquido = cab.indexOf("valor líquido");
  const idxModalidade = cab.indexOf("modalidade");
  const idxNSU = cab.indexOf("NSU/CV");

  const items: ParsedStatementItem[] = [];

  for (let i = 1; i < linhas.length; i++) {

    if (!linhas[i].trim()) continue;

    const c = linhas[i].split(",");

    if (i === 1) {
  console.log(c);
}
    
    const data = c[idxData];
    const valor = c[idxValor];
    const modalidade = c[idxModalidade];
    const nsu = c[idxNSU];

    items.push({

      item_date: data.split("/").reverse().join("-"),

      description: `${modalidade} NSU ${nsu}`,

      amount: money(valor),

      direction: "credit",

      inferred_payment_method: paymentMethod(modalidade),

      balance: 0

    });

  }

  return {

    raw_text: csv,

    items,

    total_credits: items.reduce((s, i) => s + i.amount, 0),

    total_debits: 0,

    bank_hint: "Rede"

  };

}
