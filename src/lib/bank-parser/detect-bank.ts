export type SupportedBank =
  | "sicredi"
  | "infyniti"
  | "itau"
  | "bradesco"
  | "bb"
  | "santander"
  | "caixa"
  | "nubank"
  | "inter"
  | "generic";

export function detectBank(text: string): SupportedBank {
  const t = text.toLowerCase();

  if (t.includes("sicredi")) return "sicredi";

  if (
    t.includes("infyniti") ||
    t.includes("infinity") ||
    t.includes("infinitepay")
  )
    return "infyniti";

  if (t.includes("itaú") || t.includes("itau")) return "itau";

  if (t.includes("bradesco")) return "bradesco";

  if (t.includes("banco do brasil")) return "bb";

  if (t.includes("santander")) return "santander";

  if (t.includes("caixa econômica") || t.includes("caixa economica"))
    return "caixa";

  if (t.includes("nubank")) return "nubank";

  if (t.includes("inter")) return "inter";

  return "generic";
}
