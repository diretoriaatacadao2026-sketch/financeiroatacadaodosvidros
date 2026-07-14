import { ParsedStatement, ParsedStatementItem } from "../types";
import { inferPaymentMethod } from "./generic";

function splitCsvLine(line: string, delim: string): string[] {
  return line.split(delim).map((c) => c.replace(/^"|"$/g, "").trim());
}

function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = {
    ";": (headerLine.match(/;/g) || []).length,
    ",": (headerLine.match(/,/g) || []).length,
    "\t": (headerLine.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function toIsoDate(token: string): string | null {
  const m = token.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${m[2]}-${m[1]}`;
  }
  const iso = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return token;
  return null;
}

function toNumber(token: string): number | null {
  if (!token) return null;
  const clean = token.replace(/[R$\s"]/g, "");
  // pt-BR: 1.234,56  |  en: 1234.56
  let normalized = clean;
  if (/,\d{2}$/.test(clean)) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  }
  const val = parseFloat(normalized);
  return isNaN(val) ? null : val;
}

const HEADER_ALIASES = {
  date: ["data", "data da venda", "data do lançamento", "data lançamento", "date"],
  description: ["descrição", "descricao", "histórico", "historico", "description", "lançamento"],
  amountGross: ["valor bruto", "valor da venda original", "valor original", "gross amount"],
  amountNet: ["valor líquido", "valor liquido", "net amount"],
  amount: ["valor", "amount", "value"],
  status: ["status", "situação", "situacao"],
};

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

/**
 * Fallback for any CSV layout not recognized by a dedicated parser (Rede/InfinitePay).
 * Always prefers the "valor bruto" column when present, so reconciliation is done
 * against the gross value, not the net-of-fees value.
 */
export function parseGenericCsv(csv: string): ParsedStatement {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { raw_text: csv, items: [], total_credits: 0, total_debits: 0, bank_hint: null };
  }

  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim);

  const idxDate = findColumn(headers, HEADER_ALIASES.date);
  const idxDesc = findColumn(headers, HEADER_ALIASES.description);
  const idxGross = findColumn(headers, HEADER_ALIASES.amountGross);
  const idxNet = findColumn(headers, HEADER_ALIASES.amountNet);
  const idxAmount = idxGross !== -1 ? idxGross : (findColumn(headers, HEADER_ALIASES.amount) !== -1 ? findColumn(headers, HEADER_ALIASES.amount) : idxNet);
  const idxStatus = findColumn(headers, HEADER_ALIASES.status);

  if (idxDate === -1 || idxAmount === -1) {
    throw new Error("Layout do CSV não reconhecido: não encontrei colunas de data e valor.");
  }

  const items: ParsedStatementItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i], delim);
    if (cols.length <= Math.max(idxDate, idxAmount)) continue;

    if (idxStatus !== -1) {
      const status = (cols[idxStatus] || "").toLowerCase();
      if (status && !/aprovad|pago|confirmad|conclu[ií]d|liquidad/.test(status)) continue;
    }

    const dateRaw = cols[idxDate];
    const isoDate = toIsoDate(dateRaw);
    if (!isoDate) continue;

    const amount = toNumber(cols[idxAmount]);
    if (amount === null) continue;

    const description = idxDesc !== -1 ? cols[idxDesc] : "";

    items.push({
      item_date: isoDate,
      description,
      amount: Math.abs(amount),
      direction: amount < 0 ? "debit" : "credit",
      inferred_payment_method: inferPaymentMethod(description),
      balance: 0,
    });
  }

  return {
    raw_text: csv,
    items,
    total_credits: items.filter((i) => i.direction === "credit").reduce((s, i) => s + i.amount, 0),
    total_debits: items.filter((i) => i.direction === "debit").reduce((s, i) => s + i.amount, 0),
    bank_hint: null,
  };
}
