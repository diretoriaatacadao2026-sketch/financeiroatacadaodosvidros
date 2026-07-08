import { ParsedStatementItem } from "./types";

export interface MatchRow extends ParsedStatementItem {
  status: "matched" | "divergent" | "unmatched";
  matched_tx_id: string | null;
  manual: boolean;
}

export function doMatch(
  statements: ParsedStatementItem[],
  transactions: any[]
): MatchRow[] {

  return statements.map((s) => {

    let melhor: any = null;
    let melhorScore = 0;

    for (const t of transactions) {

      let score = 0;

      // Valor (peso maior)
      if (Math.abs(Number(t.amount) - s.amount) < 0.01)
        score += 60;

      // Data
      if (t.date === s.item_date)
        score += 20;

      // Tipo
      if (
        (s.direction === "credit" && t.tx_type === "entrada") ||
        (s.direction === "debit" && t.tx_type === "saida")
      )
        score += 10;

      // Forma de pagamento
      if (
        t.payment_method &&
        s.inferred_payment_method &&
        t.payment_method === s.inferred_payment_method
      )
        score += 5;

      // Descrição
      const d1 = (t.description ?? "").toUpperCase();
      const d2 = (s.description ?? "").toUpperCase();

      if (
        d1 &&
        d2 &&
        (d1.includes(d2) || d2.includes(d1))
      )
        score += 5;

      if (score > melhorScore) {
        melhorScore = score;
        melhor = t;
      }
    }

    return {

      ...s,

      matched_tx_id:
        melhorScore >= 80
          ? melhor.id
          : null,

      manual: false,

      status:
        melhorScore >= 90
          ? "matched"
          : melhorScore >= 60
          ? "divergent"
          : "unmatched",

    };

  });

}
