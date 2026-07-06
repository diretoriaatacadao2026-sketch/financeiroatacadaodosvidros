export type TransactionType = "credit" | "debit";

export type PaymentMethod =
  | "pix"
  | "ted"
  | "doc"
  | "boleto"
  | "cartao"
  | "dinheiro"
  | "cheque"
  | "desconhecido";

export interface BankTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number;
  type: TransactionType;
  paymentMethod: PaymentMethod;
  document?: string;
  rawLine: string;
}

export interface ParsedStatement {
  bank: string;
  transactions: BankTransaction[];
  totalCredits: number;
  totalDebits: number;
}
