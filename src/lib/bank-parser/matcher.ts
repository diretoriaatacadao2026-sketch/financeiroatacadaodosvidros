import { ParsedStatementItem } from "./types";

export interface MatchResult {
  statement: ParsedStatementItem;
  transaction: any;
  score: number;
  autoMatch: boolean;
}

export function doMatch(
  statements: ParsedStatementItem[],
  transactions: any[]
): MatchResult[] {

  const results: MatchResult[] = [];

  for (const s of statements) {

    let best: any = null;
    let bestScore = 0;

    for (const t of transactions) {

      let score = 0;

      // Valor
      if (Math.abs(Number(t.amount) - s.amount) < 0.01)
        score += 60;

      // Data
      if (t.date === s.item_date)
        score += 20;

      // Forma de pagamento
      if (
        t.payment_method &&
        s.inferred_payment_method &&
        t.payment_method === s.inferred_payment_method
      )
        score += 10;

      // Descrição
      const d1 = (t.description || "").toUpperCase();
      const d2 = (s.description || "").toUpperCase();

      if (
        d1 &&
        d2 &&
        (d1.includes(d2) || d2.includes(d1))
      )
        score += 10;

      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }

    results.push({
      statement: s,
      transaction: best,
      score: bestScore,
      autoMatch: bestScore >= 90,
    });
  }

  return results;
}
