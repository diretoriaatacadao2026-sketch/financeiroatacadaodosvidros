import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR, PAYMENT_METHODS } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Lock, Unlock, CheckCheck, FileText } from "lucide-react";

const searchSchema = z.object({
  pm: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/_authenticated/extrato/$date")({
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  head: ({ params }) => ({ meta: [{ title: `Extrato ${params.date} — Glass ERP` }] }),
  component: () => (
    <Suspense fallback={<div className="text-muted-foreground">Carregando extrato...</div>}>
      <ExtratoPage />
    </Suspense>
  ),
  errorComponent: ({ error }) => <div className="text-destructive">Erro: {error.message}</div>,
  notFoundComponent: () => <div>Dia não encontrado.</div>,
});

interface Tx {
  id: string;
  number: number;
  tx_date: string;
  created_at: string;
  client_name: string | null;
  budget_number: string | null;
  description: string;
  amount: number;
  payment_method: string;
  tx_type: "entrada" | "saida";
  company_id: string;
  account_id: string;
  created_by: string | null;
  reconciled: boolean;
  reconciled_at: string | null;
  reconciled_by: string | null;
}

const dayQuery = (date: string) => queryOptions({
  queryKey: ["extrato-day", date],
  queryFn: async () => {
    const [{ data: tx }, { data: companies }, { data: accounts }, { data: closings }] = await Promise.all([
      supabase
        .from("cash_transactions")
        .select("id, number, tx_date, created_at, client_name, budget_number, description, amount, payment_method, tx_type, company_id, account_id, created_by, reconciled, reconciled_at, reconciled_by")
        .eq("tx_date", date)
        .order("created_at", { ascending: true }),
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("cash_accounts").select("id, name, company_id"),
      supabase.from("cash_closings" as never).select("company_id, closing_date").eq("closing_date", date),
    ]);
    return {
      tx: (tx ?? []) as Tx[],
      companies: (companies ?? []) as { id: string; name: string }[],
      accounts: (accounts ?? []) as { id: string; name: string; company_id: string }[],
      closings: ((closings ?? []) as unknown) as { company_id: string }[],
    };
  },
});

function ExtratoPage() {
  const { date } = Route.useParams();
  const { pm } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(dayQuery(date));
  const { display: userName } = useUserNames();
  const [busy, setBusy] = useState(false);

  const toggleReconciled = async (tx: Tx, next: boolean) => {
    setBusy(true);
    const patch = next
      ? { reconciled: true, reconciled_at: new Date().toISOString(), reconciled_by: (await supabase.auth.getUser()).data.user?.id ?? null }
      : { reconciled: false, reconciled_at: null, reconciled_by: null };
    const { error } = await supabase.from("cash_transactions").update(patch).eq("id", tx.id);
    setBusy(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["extrato-day", date] });
  };

  const conciliarTodos = async () => {
    const pending = data.tx.filter((t) => !t.reconciled);
    if (pending.length === 0) return;
    if (!confirm(`Marcar ${pending.length} lançamento(s) como conciliado(s)?`)) return;
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("cash_transactions")
      .update({ reconciled: true, reconciled_at: new Date().toISOString(), reconciled_by: uid })
      .in("id", pending.map((t) => t.id));
    setBusy(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`${pending.length} lançamento(s) conciliados`);
    qc.invalidateQueries({ queryKey: ["extrato-day", date] });
  };

  const filtered = useMemo(
    () => pm === "all" ? data.tx : data.tx.filter((t) => t.payment_method === pm),
    [data.tx, pm],
  );

  const totals = useMemo(() => {
    const e = filtered.filter((t) => t.tx_type === "entrada").reduce((s, t) => s + Number(t.amount), 0);
    const s = filtered.filter((t) => t.tx_type === "saida").reduce((sum, t) => sum + Number(t.amount), 0);
    return { entradas: e, saidas: s, saldo: e - s };
  }, [filtered]);

  const byPayment = useMemo(() => {
    const m = new Map<string, number>();
    data.tx.forEach((t) => {
      const cur = m.get(t.payment_method) ?? 0;
      m.set(t.payment_method, cur + (t.tx_type === "entrada" ? Number(t.amount) : -Number(t.amount)));
    });
    return m;
  }, [data.tx]);

  const closedCompanies = new Set(data.closings.map((c) => c.company_id));
  const totalCompanies = data.companies.length;
  const isFullyClosed = totalCompanies > 0 && closedCompanies.size >= totalCompanies;
  const isPartial = closedCompanies.size > 0 && !isFullyClosed;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="text-xs text-muted-foreground uppercase">Extrato do dia</div>
            <h1 className="text-2xl font-bold tracking-tight">{dateBR(date)}</h1>
          </div>
          {isFullyClosed && (
            <Badge className="gap-1 bg-muted text-foreground hover:bg-muted">
              <Lock className="h-3 w-3" /> Caixa fechado
            </Badge>
          )}
          {isPartial && (
            <Badge variant="outline" className="gap-1 text-amber-500 border-amber-500/40">
              <Lock className="h-3 w-3" /> Fechado parcialmente
            </Badge>
          )}
          {!isFullyClosed && !isPartial && (
            <Badge variant="outline" className="gap-1"><Unlock className="h-3 w-3" /> Caixa aberto</Badge>
          )}
        </div>
        <Button asChild variant="outline">
          <Link to="/caixa">Ir para Fechamento de Caixa</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Entradas</div>
          <div className="mt-1 text-xl font-bold text-[color:var(--success)]">{brl(totals.entradas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Saídas</div>
          <div className="mt-1 text-xl font-bold text-destructive">{brl(totals.saidas)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Saldo</div>
          <div className="mt-1 text-xl font-bold">{brl(totals.saldo)}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Movimentações</h3>
            <p className="text-xs text-muted-foreground">{filtered.length} de {data.tx.length} registros</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar por forma de pagamento:</span>
            <Select value={pm} onValueChange={(v) => navigate({ search: { pm: v }, replace: true })}>
              <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas ({data.tx.length})</SelectItem>
                {PAYMENT_METHODS.map((p) => {
                  const count = data.tx.filter((t) => t.payment_method === p.value).length;
                  if (count === 0) return null;
                  return <SelectItem key={p.value} value={p.value}>{p.label} ({count})</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {byPayment.size > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from(byPayment.entries()).map(([method, saldo]) => {
              const label = PAYMENT_METHODS.find((p) => p.value === method)?.label ?? method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => navigate({ search: { pm: method }, replace: true })}
                  className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${pm === method ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                >
                  <div className="font-medium">{label}</div>
                  <div className="tabular-nums text-muted-foreground">{brl(saldo)}</div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Horário</TableHead>
                <TableHead className="w-16">Nº</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Orçamento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Registrado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    Sem movimentações para este filtro.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((t) => {
                const acc = data.accounts.find((a) => a.id === t.account_id);
                const comp = data.companies.find((c) => c.id === t.company_id);
                const pmLabel = PAYMENT_METHODS.find((p) => p.value === t.payment_method)?.label ?? t.payment_method;
                const time = new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs tabular-nums">{time}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">#{t.number}</TableCell>
                    <TableCell className="text-sm">{comp?.name}</TableCell>
                    <TableCell className="text-sm">{acc?.name}</TableCell>
                    <TableCell className="text-sm">{t.client_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{t.budget_number ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{t.description}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-normal">{pmLabel}</Badge></TableCell>
                    <TableCell className="text-right">
                      <span className={t.tx_type === "entrada"
                        ? "inline-flex items-center gap-1 font-semibold text-[color:var(--success)]"
                        : "inline-flex items-center gap-1 font-semibold text-destructive"}>
                        {t.tx_type === "entrada" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {brl(Number(t.amount))}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{userName(t.created_by)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
