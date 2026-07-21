import * as XLSX from "xlsx";

/**
 * Reads the daily "Vendas Atacado" cash-closing spreadsheet (.xlsx) and
 * extracts one entry per client per non-empty payment column.
 *
 * The workbook has one sheet per day of the month (named "01", "02", "07"...),
 * plus a "MOD" (template) sheet that should never be imported.
 *
 * Only .xlsx is supported for this specific sheet. A PDF export of this
 * sheet loses the empty cells (blank columns simply don't emit any text),
 * so a value like "R$ 268,84" can no longer be reliably matched back to
 * "DÉBITO" vs "CRÉ/VISTA" vs "PIX" — there is nothing in the PDF text to
 * anchor it to the right column. The .xlsx keeps every cell in its real
 * column, so column mapping is exact.
 */

export type ClosingPaymentKey =
  | "dinheiro"
  | "debito"
  | "credito_vista"
  | "credito_parcelado"
  | "pix_transferencia"
  | "credito_loja";

export interface ClosingEntry {
  row: number;
  client_name: string;
  budget_number: string | null;
  column: ClosingPaymentKey;
  column_label: string;
  amount: number;
  // Default suggestion only — always editable by the user before saving,
  // since the sheet itself doesn't say which bank/account each column goes to.
  suggested_account_kind: "caixa_fisica" | "sicredi" | "infinity";
  payment_method:
    | "dinheiro"
    | "cartao_debito"
    | "cartao_credito"
    | "pix"
    | "credito_loja";
}

const COLUMN_DEFS: {
  key: ClosingPaymentKey;
  label: string;
  match: (normalized: string) => boolean;
  payment_method: ClosingEntry["payment_method"];
  suggested_account_kind: ClosingEntry["suggested_account_kind"];
}[] = [
  {
    key: "dinheiro",
    label: "Dinheiro",
    match: (h) => h === "DINHEIRO",
    payment_method: "dinheiro",
    suggested_account_kind: "caixa_fisica",
  },
  {
    key: "debito",
    label: "Débito",
    match: (h) => h.includes("DEBITO"),
    payment_method: "cartao_debito",
    suggested_account_kind: "infinity",
  },
  {
    key: "credito_vista",
    label: "Crédito à vista",
    match: (h) => h.includes("CRE") && h.includes("VISTA"),
    payment_method: "cartao_credito",
    suggested_account_kind: "infinity",
  },
  {
    key: "credito_parcelado",
    label: "Crédito parcelado",
    match: (h) => h.includes("CRE") && h.includes("PARCEL"),
    payment_method: "cartao_credito",
    suggested_account_kind: "infinity",
  },
  {
    key: "pix_transferencia",
    label: "PIX / Transferência",
    match: (h) => h.includes("PIX") || h.includes("TRANSFER"),
    payment_method: "pix",
    suggested_account_kind: "sicredi",
  },
  {
    key: "credito_loja",
    label: "Crédito loja",
    match: (h) => h.includes("CRE") && h.includes("LOJA"),
    payment_method: "credito_loja",
    suggested_account_kind: "infinity",
  },
];

const STOP_CLIENT_NAMES = [
  "TOTAL",
  "SUPLEMENTO DO DIA",
  "SUPLEMENTO",
  "SAIDA",
  "SAÍDA",
  "SAIDAS",
  "SAÍDAS",
];

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function normalizeClientKey(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** "Manoel Pereira 6185" -> { name: "Manoel Pereira", budget: "6185" } */
function splitClientAndBudget(raw: string): { name: string; budget: string | null } {
  const trimmed = raw.trim();
  const m = trimmed.match(/\b(\d{3,7}(?:\/\d{3,7})?)\b/);
  if (!m) return { name: trimmed, budget: null };
  const name = trimmed.slice(0, m.index).trim().replace(/[-–]+$/, "").trim();
  return { name: name || trimmed, budget: m[1] };
}

export function readClosingWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "array", cellFormula: true });
}

/**
 * Parses the row-ranges referenced by a TOTAL cell's SUM formula, e.g.
 * "SUM(D13:D48)" -> [[12,47]] (0-based, inclusive) or
 * "SUM(F3:F34)+SUM(F36:F48)" -> [[2,33],[35,47]].
 * Returns null if there's no formula to parse (plain number, or unexpected shape),
 * meaning "no restriction — include every data row".
 */
function parseSumRowRanges(formula: string | undefined): [number, number][] | null {
  if (!formula) return null;
  const ranges: [number, number][] = [];
  const re = /[A-Z]+(\d+):[A-Z]+(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) {
    ranges.push([parseInt(m[1], 10) - 1, parseInt(m[2], 10) - 1]);
  }
  return ranges.length > 0 ? ranges : null;
}

function rowAllowed(ranges: [number, number][] | null, rowIdx: number): boolean {
  if (ranges === null) return true;
  return ranges.some(([start, end]) => rowIdx >= start && rowIdx <= end);
}

/**
 * Lists sheet names that look like a day of the month (e.g. "01".."31"),
 * excluding template/model sheets such as "MOD".
 */
export function listClosingDaySheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.filter((name) => /^\d{1,2}$/.test(name.trim()));
}

/**
 * Picks the sheet matching the day-of-month of the given ISO date
 * ("2026-07-02" -> "02"), falling back to the same number without
 * leading zero, or null if nothing matches.
 */
export function guessSheetForDate(wb: XLSX.WorkBook, isoDate: string): string | null {
  const day = isoDate.split("-")[2];
  if (!day) return null;
  const padded = day.padStart(2, "0");
  const names = listClosingDaySheets(wb);
  if (names.includes(padded)) return padded;
  const unpadded = String(parseInt(day, 10));
  if (names.includes(unpadded)) return unpadded;
  return null;
}

export function parseCashClosingSheet(wb: XLSX.WorkBook, sheetName: string): ClosingEntry[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Aba "${sheetName}" não encontrada na planilha.`);
  }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  // Find the header row: the first row that contains a cell matching "CLIENTE(S)"
  let headerRowIdx = -1;
  let clientColIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const idx = row.findIndex((c) => normalizeHeader(c).startsWith("CLIENTE"));
    if (idx !== -1) {
      headerRowIdx = r;
      clientColIdx = idx;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      `Não encontrei a coluna "CLIENTES" na aba "${sheetName}". Verifique se é a aba certa e se o cabeçalho está na primeira linha da tabela de vendas.`
    );
  }

  const headerRow = rows[headerRowIdx];
  const colIndexFor = new Map<ClosingPaymentKey, number>();

  for (const def of COLUMN_DEFS) {
    // First matching column only (left block of the sheet — DINHEIRO..CRÉ/LOJA),
    // skipping columns already claimed by an earlier column definition. This
    // keeps us out of the "INFINITY" block on the right, which repeats
    // DÉBITO/CRÉDITO/PIX and must be ignored per instruction.
    for (let c = 0; c < headerRow.length; c++) {
      if (Array.from(colIndexFor.values()).includes(c)) continue;
      const normalized = normalizeHeader(headerRow[c]);
      if (normalized && def.match(normalized)) {
        colIndexFor.set(def.key, c);
        break;
      }
    }
  }

  const missing = COLUMN_DEFS.filter((d) => !colIndexFor.has(d.key)).map((d) => d.label);
  if (missing.length > 0) {
    throw new Error(`Não encontrei as colunas: ${missing.join(", ")}. Confira os cabeçalhos da aba "${sheetName}".`);
  }

  // Find the TOTAL row so we can read each column's official SUM formula.
  // Some daily sheets exclude specific rows from a column's total (usually
  // because a value was typed in the wrong column) — we must honor exactly
  // the same rows the sheet's own TOTAL uses, or our imported amount won't
  // match what the person who closed the register already validated.
  let totalRowIdx = -1;
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    if (normalizeClientKey(rows[r][clientColIdx]) === "TOTAL") {
      totalRowIdx = r;
      break;
    }
  }

  const allowedRangesFor = new Map<ClosingPaymentKey, [number, number][] | null>();
  if (totalRowIdx !== -1) {
    for (const def of COLUMN_DEFS) {
      const colIdx = colIndexFor.get(def.key)!;
      const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c: colIdx });
      const cell = sheet[addr] as { f?: string } | undefined;
      allowedRangesFor.set(def.key, parseSumRowRanges(cell?.f));
    }
  }

  const entries: ClosingEntry[] = [];

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const clientRaw = String(row[clientColIdx] ?? "").trim();
    if (!clientRaw) continue;

    const clientKey = normalizeClientKey(clientRaw);
    if (STOP_CLIENT_NAMES.some((w) => clientKey === w || clientKey.startsWith(w))) {
      // "TOTAL" marks the end of the client table.
      if (clientKey === "TOTAL") break;
      continue;
    }

    const { name, budget } = splitClientAndBudget(clientRaw);

    for (const def of COLUMN_DEFS) {
      const colIdx = colIndexFor.get(def.key)!;
      const amount = toNumber(row[colIdx]);
      if (amount > 0 && rowAllowed(allowedRangesFor.get(def.key) ?? null, r)) {
        entries.push({
          row: r + 1,
          client_name: name,
          budget_number: budget,
          column: def.key,
          column_label: def.label,
          amount,
          suggested_account_kind: def.suggested_account_kind,
          payment_method: def.payment_method,
        });
      }
    }
  }

  return entries;
}
