import {
  ParsedStatement,
  ParsedStatementItem,
} from "../types";

function money(v: string): number {
  return Number(
    (v || "0")
      .replace(/"/g, "")
      .replace(/[R$\s]/g, "")
      .replace(/'/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );
}

function paymentMethod(meio: string) {
  const m = (meio || "").toLowerCase();
  if (m.includes("pix")) return "pix";
  if (m.includes("débito") || m.includes("debito")) return "cartao_debito";
  return "cartao_credito";
}

// Parser de CSV simples que respeita campos entre aspas (podem conter vírgula dentro, ex: "54,70")
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
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

  const idxData = findColumn(headers, ["data e hora", "data da venda", "data", "date"]);
  const idxDesc = findColumn(headers, [
    "descrição",
    "descricao",
    "forma de pagamento",
    "meio de pagamento",
    "modalidade",
    "meio",
  ]);
  const idxStatus = findColumn(headers, ["status", "situação", "situacao"]);
  // Sempre prioriza o valor BRUTO (antes das taxas). No export da InfinitePay
  // a coluna se chama "Valor (R$)"; "Líquido (R$)" é o valor já com taxa descontada
  // e NÃO deve ser usado para conciliação.
  const idxGross = findColumn(headers, ["valor bruto", "valor (r$)", "valor"]);
  const idxNet = findColumn(headers, ["líquido (r$)", "valor líquido", "valor liquido", "liquido"]);
  const idxAmount = idxGross !== -1 ? idxGross : idxNet;

  if (idxData === -1 || idxAmount === -1) {
    throw new Error("Layout do CSV da InfinitePay não reconhecido: colunas de data/valor não encontradas.");
  }

  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (!c || c.length <= Math.max(idxData, idxAmount)) continue;

    if (idxStatus !== -1) {
      const status = (c[idxStatus] || "").trim().toLowerCase();
      if (status && status !== "aprovada" && status !== "aprovado" && !status.includes("pago")) continue;
    }

    const dataRaw = c[idxData];
    if (!dataRaw || dataRaw.length < 10) continue;

    // "13/07/2026 17:37" ou "13/07/2026" -> "2026-07-13"
    const item_date =
      dataRaw.substring(6, 10) + "-" + dataRaw.substring(3, 5) + "-" + dataRaw.substring(0, 2);

    const description = idxDesc !== -1 ? c[idxDesc] : "";

    const amount = Math.abs(money(c[idxAmount]));
    if (!amount) continue;

    items.push({
      item_date,
      description,
      amount,
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
