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

function toISO(date: string): string {
  // 10/07/2026 15:42
  const [d, h] = date.split(" ");
  const [dia, mes, ano] = d.split("/");

  return `${ano}-${mes}-${dia}`;
}

export function parseInfynitiCsv(csv: string): ParsedStatement {

  const items: ParsedStatementItem[] = [];

  const lines = csv
    .split(/\r?\n/)
    .filter(l => l.trim());

  alert(csv.substring(0, 1000));

  if (lines.length < 2) {
    throw new Error("CSV vazio.");
  }

  const header = lines[0].split(";");

  const idxData = header.findIndex(h => h.toLowerCase().includes("data"));
  const idxMeio = header.findIndex(h => h.toLowerCase().includes("meio"));
  const idxStatus = header.findIndex(h => h.toLowerCase().includes("status"));
  const idxValor = header.findIndex(h => h.toLowerCase().includes("valor"));
  const idxLiquido = header.findIndex(h => h.toLowerCase().includes("líquido") || h.toLowerCase().includes("liquido"));

  for (let i = 1; i < lines.length; i++) {

    const c = lines[i].split(";");

    if (!c[idxStatus]) continue;

    if (
      c[idxStatus]
        .toLowerCase()
        .trim() !== "aprovada"
    ) continue;

    const meio = c[idxMeio].toLowerCase();

    items.push({

      item_date: toISO(c[idxData]),

      description: c[idxMeio],

      amount: money(c[idxValor]),

      direction: "credit",

      inferred_payment_method:
        meio.includes("pix")
          ? "pix"
          : meio.includes("débito") || meio.includes("debito")
          ? "cartao_debito"
          : "cartao_credito",

      balance: 0,

    });

  }

  return {

    raw_text: csv,

    items,

    total_credits: items.reduce((s, i) => s + i.amount, 0),

    total_debits: 0,

    bank_hint: "Infyniti",

  };

}
