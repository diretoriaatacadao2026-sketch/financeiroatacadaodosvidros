import { ParsedStatement, ParsedStatementItem } from "../types";

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function parseBRDate(token: string, fallbackYear: number): string | null {
  const m1 = token.match(/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    let y = m1[3] ? parseInt(m1[3], 10) : fallbackYear;
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const m2 = token.toLowerCase().match(/^(\d{1,2})[-/\s]([a-z]{3})/);
  if (m2) {
    const d = parseInt(m2[1], 10);
    const mo = MONTHS[m2[2]];
    if (!mo) return null;
    return `${fallbackYear}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function parseBRAmount(token: string): number | null {
  const clean = token.replace(/[R$\s]/g, "");
  const m = clean.match(/^(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})([CDcd])?$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const int = m[2].replace(/\./g, "");
  const dec = m[3];
  const val = sign * parseFloat(`${int}.${dec}`);
  if (isNaN(val)) return null;
  return val;
}

export function inferPaymentMethod(desc: string): ParsedStatementItem["inferred_payment_method"] {
  const s = desc.toLowerCase();
  if (/\bpix\b/.test(s)) return "pix";
  if (/\b(ted|doc|transf|transferencia|transferência)\b/.test(s)) return "transferencia";
  if (/boleto|cobran[cç]a|t[ií]tulo/.test(s)) return "boleto";
  if (/cheque/.test(s)) return "cheque";
  if (/cr[eé]dito.*(cart|visa|master|elo|hiper)|cart[aã]o.*cr[eé]d|compra.*cr[eé]dito/.test(s)) return "cartao_credito";
  if (/d[eé]bito.*(cart|visa|master|elo)|cart[aã]o.*d[eé]b|compra.*d[eé]bito/.test(s)) return "cartao_debito";
  if (/saque|dep[oó]sito.*dinheiro|dinheiro/.test(s)) return "dinheiro";
  return null;
}

const IGNORE_KEYWORDS = /saldo|s\s*a\s*l\s*d\s*o|total|per[ií]odo|extrato|conta corrente|ag[eê]ncia|cliente|data.*hist|lan[cç]amento|dispon[ií]vel/i;

/**
 * Parses raw text (from a PDF, an OCR'd image, or any plain text extrato)
 * into statement items. Amounts are taken exactly as printed (valor bruto),
 * with no fee/deduction logic applied.
 */
export function parseGenericText(text: string, bankHint: string | null = null): ParsedStatement {
  const now = new Date();
  const fallbackYear = now.getFullYear();

  const items: ParsedStatementItem[] = [];
  const lines = text.split(/\n+/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 8) continue;
    if (IGNORE_KEYWORDS.test(line)) continue;

    const tokens = line.split(/\s+/);
    let dateToken: string | null = null;
    let dateIdx = -1;
    for (let i = 0; i < Math.min(4, tokens.length); i++) {
      const d = parseBRDate(tokens[i], fallbackYear);
      if (d) { dateToken = d; dateIdx = i; break; }
    }
    if (!dateToken) continue;

    let amount: number | null = null;
    let amountIdx = -1;
    let dcMarker: "C" | "D" | null = null;
    for (let i = tokens.length - 1; i > dateIdx; i--) {
      let tk = tokens[i];
      let marker: "C" | "D" | null = null;
      if (/^[CDcd]$/.test(tk) && i > 0) {
        marker = tk.toUpperCase() as "C" | "D";
        tk = tokens[i - 1];
      }
      const val = parseBRAmount(tk);
      if (val !== null) {
        amount = val;
        amountIdx = marker ? i - 1 : i;
        dcMarker = marker;
        break;
      }
    }
    if (amount === null) continue;

    const description = tokens.slice(dateIdx + 1, amountIdx)
      .filter((t) => !/^[CDcd]$/.test(t))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    if (!description) continue;

    let direction: "credit" | "debit";
    if (dcMarker === "C") direction = "credit";
    else if (dcMarker === "D") direction = "debit";
    else direction = amount >= 0 ? "credit" : "debit";

    items.push({
      item_date: dateToken,
      description,
      amount: Math.abs(amount),
      direction,
      inferred_payment_method: inferPaymentMethod(description),
      balance: 0,
    });
  }

  const total_credits = items.filter((i) => i.direction === "credit").reduce((s, i) => s + i.amount, 0);
  const total_debits = items.filter((i) => i.direction === "debit").reduce((s, i) => s + i.amount, 0);

  return { raw_text: text, items, total_credits, total_debits, bank_hint: bankHint };
}
