export type StatementPaymentMethod =
  | "pix"
  | "transferencia"
  | "cartao_debito"
  | "cartao_credito"
  | "boleto"
  | "dinheiro"
  | "cheque"
  | null;

export interface ParsedStatementItem {
  item_date: string;
  description: string;
  amount: number;
  direction: "credit" | "debit";
  inferred_payment_method: StatementPaymentMethod;
  balance: number;
}

export interface ParsedStatement {
  raw_text: string;
  items: ParsedStatementItem[];
  total_credits: number;
  total_debits: number;
  bank_hint: string | null;
}
