export function detectBank(text: string): string {

    const t = text.toLowerCase();

    if (t.includes("sicredi"))
        return "sicredi";

    if (t.includes("infyniti"))
        return "infyniti";

    if (t.includes("itaú") || t.includes("itau"))
        return "itau";

    if (t.includes("bradesco"))
        return "bradesco";

    if (t.includes("banco do brasil"))
        return "bb";

    if (t.includes("caixa econômica"))
        return "caixa";

    if (t.includes("nubank"))
        return "nubank";

    if (t.includes("santander"))
        return "santander";

    return "generic";

}
