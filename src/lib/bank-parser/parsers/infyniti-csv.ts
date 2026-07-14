import {
  ParsedStatement,
  ParsedStatementItem,
} from "../types";

function money(v: string): number {
  return Number(
    (v || "0")
      .replace(/"/g, "")
      .replace(/[R$\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
}

function paymentMethod(meio: string) {
  const m = (meio || "").toLowerCase();
  if (m.includes("pix")) return "pix";
  if (m.includes("débito") || m.includes("debito") || m.includes("dÃ©bito")) return "cartao_debito";
  return "cartao_credito";
}

function splitCsvLine(line: string): string[] {
  const matches = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
  return (matches ?? []).map((c) => c.replace(/^"|"$/g, "").trim());
}

function findColumn(headers: string[], aliases: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return idx;
  }
  for (let i = 0; i < lower.length; i++) {
    if (aliases.some((a) => lower[i].includes(a))) return i;
  }
  return -1;
}

export function parseInfynitiCsv(csv: string): ParsedStatement {
  const items: ParsedStatementItem[] = [];

  const lines = csv.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length <= 1) {
    return {
      raw_text: csv,
      items: [],
      total_credits: 0,
      total_debits: 0,
      bank_hint: "Infyniti",
    };
  }

  const headers = splitCsvLine(lines[0]);

  const idxData = findColumn(headers, ["data da venda", "data", "date"]);
  const idxDesc = findColumn(headers, ["descrição", "descricao", "forma de pagamento", "meio de pagamento", "modalidade"]);
  const idxStatus = findColumn(headers, ["status", "situação", "situacao"]);
  // Sempre prioriza o valor BRUTO (antes das taxas); só cai para "valor" genérico
  // ou "valor líquido" se a coluna de bruto não existir no export.
  const idxGross = findColumn(headers, ["valor bruto"]);
  const idxGeneric = findColumn(headers, ["valor"]);
  const idxNet = findColumn(headers, ["valor líquido", "valor liquido"]);
  const idxAmount = idxGross !== -1 ? idxGross : (idxGeneric !== -1 ? idxGeneric : idxNet);

  if (idxData === -1 || idxAmount === -1) {
    throw new Error("Layout do CSV da InfinitePay não reconhecido: colunas de data/valor não encontradas.");
  }

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (!c || c.length <= Math.max(idxData, idxAmount)) continue;

    if (idxStatus !== -1) {
      const status = (c[idxStatus] || "").trim();
      if (status && status.toLowerCase() !== "aprovada") continue;
    }

    const dataRaw = c[idxData];
    if (!dataRaw || dataRaw.length < 10) continue;

    const item_date =
      dataRaw.substring(6, 10) + "-" + dataRaw.substring(3, 5) + "-" + dataRaw.substring(0, 2);

    const description = idxDesc !== -1 ? c[idxDesc] : "";

    items.push({
      item_date,
      description,
      amount: Math.abs(money(c[idxAmount])),
      direction: "credit",
      inferred_payment_method: paymentMethod(description),
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
