export type TransactionType = "credit" | "debit";

export type PaymentMethod =
  | "pix"
  | "boleto"
  | "ted"
  | "doc"
  | "cartao"
  | "cheque"
  | "dinheiro"
  | null;

export interface StatementItem {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  paymentMethod: PaymentMethod;
}

export interface ParsedStatement {
  bank: string;
  account?: string;
  agency?: string;
  period?: string;

  items: StatementItem[];

  totalCredits: number;
  totalDebits: number;

  rawText: string;
}
