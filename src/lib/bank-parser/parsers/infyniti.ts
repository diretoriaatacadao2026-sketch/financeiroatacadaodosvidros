import {
  ParsedStatement,
  ParsedStatementItem,
} from "../types";

function parseMoney(value: string): number {
  return Number(
    value
      .replace(/[R$\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
  );
}

const MONTHS: Record<string, string> = {
  Jan: "01",
  Fev: "02",
  Mar: "03",
  Abr: "04",
  Mai: "05",
  Jun: "06",
  Jul: "07",
  Ago: "08",
  Set: "09",
  Out: "10",
  Nov: "11",
  Dez: "12",
};

export function parseInfyniti(text: string): ParsedStatement {

  const items: ParsedStatementItem[] = [];

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  
console.log(lines);

  let currentDate = "";
  let currentMethod = "";

  for (let i = 0; i < lines.length; i++) {

    const line = lines[i];

    // Data
    const dateMatch = line.match(
      /^(\d{2})\s+(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez),\s+(\d{4})/
    );

    if (dateMatch) {

      const dia = dateMatch[1];
      const mes = MONTHS[dateMatch[2]];
      const ano = dateMatch[3];

      currentDate = `${ano}-${mes}-${dia}`;

      continue;
    }

    // Forma de pagamento
    if (
      line === "Pix" ||
      line === "Débito" ||
      line === "Crédito"
    ) {
      currentMethod = line;
      continue;
    }

    // Linha da venda
    if (
      line.includes("Aprovada") &&
      line.includes("+")
    ) {

      const valores = line.match(
        /\+\s*([\d.,]+)\s+\+\s*([\d.,]+)/
      );

      if (!valores) continue;

      const bruto = parseMoney(valores[1]);

      items.push({

        item_date: currentDate,

        description: currentMethod.toUpperCase(),

        amount: bruto,

        direction: "credit",

        inferred_payment_method:
          currentMethod === "Pix"
            ? "pix"
            : currentMethod === "Débito"
            ? "cartao_debito"
            : "cartao_credito",

        balance: 0,

      });

    }

  }

  return {

    raw_text: text,

    items,

    total_credits: items.reduce(
      (s, i) => s + i.amount,
      0
    ),

    total_debits: 0,

    bank_hint: "Infyniti",

  };

}
