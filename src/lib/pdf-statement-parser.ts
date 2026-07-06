// Client-side bank statement PDF parser using pdfjs-dist.
// Best-effort: handles common Brazilian bank layouts (Itaú, BB, Bradesco, Santander, Nubank).
import * as pdfjs from "pdfjs-dist";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - worker as URL
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

(pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerSrc;

export type StatementPaymentMethod =
  | "pix" | "transferencia" | "cartao_debito" | "cartao_credito"
  | "boleto" | "dinheiro" | "cheque" | null;

export interface ParsedStatementItem {
  item_date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // positive value
  direction: "credit" | "debit";
  inferred_payment_method: StatementPaymentMethod;
}


export interface ParsedStatement {
  raw_text: string;
  items: ParsedStatementItem[];
  total_credits: number;
  total_debits: number;
  bank_hint: string | null;
}

// Extract full text from PDF
async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group items by approximate Y coordinate to reconstruct lines
    const items = content.items as Array<{ str: string; transform: number[] }>;
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      const arr = rows.get(y) ?? [];
      arr.push({ x, str: it.str });
      rows.set(y, arr);
    }
    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
    const lines = sortedY.map((y) =>
      rows.get(y)!.sort((a, b) => a.x - b.x).map((c) => c.str).join(" ").replace(/\s+/g, " ").trim()
    ).filter(Boolean);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function parseBRDate(token: string, fallbackYear: number): string | null {
  // dd/mm/yyyy or dd/mm/yy or dd/mm
  const m1 = token.match(/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/);
  if (m1) {
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    let y = m1[3] ? parseInt(m1[3], 10) : fallbackYear;
    if (y < 100) y += 2000;
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // dd-mmm (e.g. 15-jan)
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
  // e.g. "1.234,56" or "1234,56" or "-1.234,56" or "1.234,56 D"
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

export function inferPaymentMethod(desc: string): StatementPaymentMethod {
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


function detectBank(text: string): string | null {
  const t = text.toLowerCase().slice(0, 2000);
  if (/ita[uú]/.test(t)) return "Itaú";
  if (/bradesco/.test(t)) return "Bradesco";
  if (/banco do brasil|\bbb\b/.test(t)) return "Banco do Brasil";
  if (/santander/.test(t)) return "Santander";
  if (/nubank|nu\s*pagamentos/.test(t)) return "Nubank";
  if (/caixa econ/.test(t)) return "Caixa";
  if (/inter\b/.test(t)) return "Inter";
  if (/sicoob/.test(t)) return "Sicoob";
  if (/sicredi/.test(t)) return "Sicredi";
  return null;
}

export async function parseStatementPdf(file: File): Promise<ParsedStatement> {
  const text = await extractText(file);
  const bank_hint = detectBank(text);
  const now = new Date();
  const fallbackYear = now.getFullYear();

  const items: ParsedStatementItem[] = [];
  const lines = text.split(/\n+/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length < 8) continue;
    if (IGNORE_KEYWORDS.test(line)) continue;

    // Find a date token anywhere at the start-ish
    const tokens = line.split(/\s+/);
    let dateToken: string | null = null;
    let dateIdx = -1;
    for (let i = 0; i < Math.min(4, tokens.length); i++) {
      const d = parseBRDate(tokens[i], fallbackYear);
      if (d) { dateToken = d; dateIdx = i; break; }
    }
    if (!dateToken) continue;

    // Find LAST amount-like token in the line (statement rows usually end with value)
    let amount: number | null = null;
    let amountIdx = -1;
    let dcMarker: "C" | "D" | null = null;
    for (let i = tokens.length - 1; i > dateIdx; i--) {
      // Handle trailing C/D marker
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
    });

  }

  const total_credits = items.filter((i) => i.direction === "credit").reduce((s, i) => s + i.amount, 0);
  const total_debits = items.filter((i) => i.direction === "debit").reduce((s, i) => s + i.amount, 0);

  return { raw_text: text, items, total_credits, total_debits, bank_hint };
}
