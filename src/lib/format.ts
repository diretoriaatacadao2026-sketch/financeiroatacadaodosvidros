export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export const dateBR = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return new Intl.DateTimeFormat("pt-BR").format(date);
};

export const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao_debito", label: "Cartão Débito" },
  { value: "cartao_credito", label: "Cartão Crédito" },
  { value: "boleto", label: "Boleto" },
  { value: "cheque", label: "Cheque" },
  { value: "credito_loja", label: "Crédito Loja" },
] as const;

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  ivan: "Ivan",
  financeiro: "Financeiro",
  gestor: "Gestor",
  montador: "Montador",
  vendedor: "Vendedor",
};
