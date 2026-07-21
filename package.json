import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { brl, dateBR, PAYMENT_METHODS } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";
import { CashClosingImportDialog } from "@/components/CashClosingImportDialog";
import { Plus, ArrowUpRight, ArrowDownRight, Trash2, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/caixa")({
  ssr: false,
  head: () => ({ meta: [{ title: "Fechamento de Caixa — Glass ERP" }] }),
  component: () => (
    <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
      <CaixaPage />
    </Suspense>
  ),
});

interface Company { id: string; name: string }
interface Account { id: string; name: string; kind: string; company_id: string }
interface Tx {
  id: string;
  number: number;
  tx_date: string;
  client_name: string | null;
  budget_number: string | null;
  description: string;
  amount: number;
  payment_method: string;
  tx_type: "entrada" | "saida";
  company_id: string;
  account_id: string;
  created_by: string | null;
}

const baseQuery = queryOptions({
  queryKey: ["caixa-base"],
  queryFn: async () => {
    const [{ data: companies }, { data: accounts }] = await Promise.all([
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("cash_accounts").select("id, name, kind, company_id"),
    ]);
    return {
      companies: (companies ?? []) as Company[],
      accounts: (accounts ?? []) as Account[],
    };
  },
});

const todayISO = () => new Date().toISOString().slice(0, 10);

interface Supply { id: string; company_id: string; supply_date: string; amount: number }

const suppliesQuery = (date: string) => queryOptions({
  queryKey: ["caixa-supplies", date],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("daily_cash_supplies" as never)
      .select("id, company_id, supply_date, amount")
      .eq("supply_date", date);
    if (error) throw error;
    return (data ?? []) as unknown as Supply[];
  },
});

interface Closing { id: string; company_id: string; closing_date: string; notes: string | null }
const closingsQuery = (date: string) => queryOptions({
  queryKey: ["caixa-closings", date],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("cash_closings" as never)
      .select("id, company_id, closing_date, notes")
      .eq("closing_date", date);
    if (error) throw error;
    return (data ?? []) as unknown as Closing[];
  },
});

const txQuery = (companyId: string | "all") =>

  queryOptions({
    queryKey: ["caixa-tx", companyId],
    queryFn: async () => {
      let q = supabase
        .from("cash_transactions")
        .select("id, number, tx_date, client_name, budget_number, description, amount, payment_method, tx_type, company_id, account_id, created_by")
        .order("tx_date", { ascending: false })
        .order("number", { ascending: false })
        .limit(500);
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

function CaixaPage() {
  const { hasRole } = useAuth();
  const { display: userName } = useUserNames();
  const canWrite = hasRole(["admin", "financeiro", "gestor"]);
  const canDelete = hasRole(["admin", "financeiro"]);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [supplyDate, setSupplyDate] = useState<string>(todayISO());

  const { data: base } = useSuspenseQuery(baseQuery);
  const { data: tx } = useSuspenseQuery(txQuery(companyFilter));
  const { data: supplies } = useSuspenseQuery(suppliesQuery(supplyDate));
  const { data: closings } = useSuspenseQuery(closingsQuery(supplyDate));
  const qc = useQueryClient();


  const totals = useMemo(() => {
    const entradas = tx.filter((t) => t.tx_type === "entrada").reduce((s, t) => s + Number(t.amount), 0);
    const saidas = tx.filter((t) => t.tx_type === "saida").reduce((s, t) => s + Number(t.amount), 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [tx]);

  const balancesByAccount = useMemo(() => {
  const map = new Map<string, number>();

  // Movimentações financeiras
  tx.forEach((t) => {
    const delta =
      t.tx_type === "entrada"
        ? Number(t.amount)
        : -Number(t.amount);

    map.set(
      t.account_id,
      (map.get(t.account_id) ?? 0) + delta
    );
  });

  // Soma os suprimentos no Caixa Físico
  supplies.forEach((s) => {

    // Procura a conta Caixa Físico da empresa
    const contaCaixa = base.accounts.find(
      (a) =>
        a.company_id === s.company_id &&
        a.name.toLowerCase().includes("caixa")
    );

    if (!contaCaixa) return;

    map.set(
      contaCaixa.id,
      (map.get(contaCaixa.id) ?? 0) + Number(s.amount)
    );

  });

  return map;

}, [tx, supplies, base.accounts]);

  const accountsToShow = companyFilter === "all" ? base.accounts : base.accounts.filter((a) => a.company_id === companyFilter);

  const onDelete = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("cash_transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Lançamento excluído");
      qc.invalidateQueries({ queryKey: ["caixa-tx"] });
      qc.invalidateQueries({ queryKey: ["dashboard-data"] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fechamento de Caixa</h1>
          <p className="text-sm text-muted-foreground">Movimente entradas e saídas por empresa e conta.</p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <CashClosingImportDialog
              companies={base.companies}
              accounts={base.accounts}
              onImported={() => {
                qc.invalidateQueries({ queryKey: ["caixa-tx"] });
                qc.invalidateQueries({ queryKey: ["dashboard-data"] });
              }}
            />
          )}
          {canWrite && <NewTransactionDialog companies={base.companies} accounts={base.accounts} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={companyFilter} onValueChange={setCompanyFilter}>
          <TabsList>
            <TabsTrigger value="all">Todas empresas</TabsTrigger>
            {base.companies.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>{c.name}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Entradas</div>
          <div className="mt-2 text-2xl font-bold text-[color:var(--success)]">{brl(totals.entradas)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Saídas</div>
          <div className="mt-2 text-2xl font-bold text-destructive">{brl(totals.saidas)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Saldo</div>
          <div className="mt-2 text-2xl font-bold">{brl(totals.saldo)}</div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-semibold">Saldo por conta</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {accountsToShow.map((a) => {
            const company = base.companies.find((c) => c.id === a.company_id);
            return (
              <div key={a.id} className="rounded-lg border bg-secondary/40 p-3">
                <div className="text-xs text-muted-foreground">{company?.name}</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="text-sm font-semibold">{brl(balancesByAccount.get(a.id) ?? 0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Suprimento de Caixa Diário</h3>
          <div className="flex items-center gap-2">
            <Label htmlFor="supply_date" className="text-xs text-muted-foreground">Data</Label>
            <Input
              id="supply_date" type="date" value={supplyDate}
              onChange={(e) => setSupplyDate(e.target.value)}
              className="h-8 w-auto"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(companyFilter === "all" ? base.companies : base.companies.filter(c => c.id === companyFilter)).map((c) => {
            const supply = supplies.find((s) => s.company_id === c.id);
            return (
              <SupplyCard
                key={c.id}
                company={c}
                supply={supply}
                date={supplyDate}
                canWrite={canWrite}
                onSaved={() => qc.invalidateQueries({ queryKey: ["caixa-supplies"] })}
              />
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Status do Caixa por Empresa</h3>
            <p className="text-xs text-muted-foreground">Marque como <strong>Fechado</strong> quando a conferência do dia estiver concluída. O status aparece no calendário do Dashboard.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(companyFilter === "all" ? base.companies : base.companies.filter(c => c.id === companyFilter)).map((c) => {
            const closing = closings.find((cl) => cl.company_id === c.id);
            const isClosed = !!closing;
            return (
              <div key={c.id} className="rounded-lg border bg-secondary/40 p-3">
                <div className="text-xs text-muted-foreground truncate">{c.name}</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    isClosed ? "text-foreground" : "text-muted-foreground",
                  )}>
                    {isClosed ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    {isClosed ? "Fechado" : "Aberto"}
                  </span>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant={isClosed ? "outline" : "default"}
                      onClick={async () => {
                        if (isClosed) {
                          const { error } = await supabase.from("cash_closings" as never).delete().eq("id", closing.id);
                          if (error) return toast.error(error.message);
                          toast.success("Caixa reaberto");
                        } else {
                          const { error } = await supabase.from("cash_closings" as never).insert({
                            company_id: c.id, closing_date: supplyDate,
                          } as never);
                          if (error) return toast.error(error.message);
                          toast.success("Caixa fechado");
                        }
                        qc.invalidateQueries({ queryKey: ["caixa-closings"] });
                        qc.invalidateQueries({ queryKey: ["dashboard-month"] });
                      }}
                    >
                      {isClosed ? "Reabrir" : "Fechar Caixa"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>





      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h3 className="font-semibold">Lançamentos</h3>
          <p className="text-xs text-muted-foreground">{tx.length} registros</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Orçamento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tx.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                    Nenhum lançamento ainda.
                  </TableCell>
                </TableRow>
              )}
              {tx.map((t) => {
                const acc = base.accounts.find((a) => a.id === t.account_id);
                const comp = base.companies.find((c) => c.id === t.company_id);
                const pm = PAYMENT_METHODS.find((p) => p.value === t.payment_method);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">#{t.number}</TableCell>
                    <TableCell className="text-sm">{dateBR(t.tx_date)}</TableCell>
                    <TableCell className="text-sm">{comp?.name}</TableCell>
                    <TableCell className="text-sm">{acc?.name}</TableCell>
                    <TableCell className="text-sm">{t.client_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{t.budget_number ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">{t.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">{pm?.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          t.tx_type === "entrada"
                            ? "inline-flex items-center gap-1 font-semibold text-[color:var(--success)]"
                            : "inline-flex items-center gap-1 font-semibold text-destructive"
                        }
                      >
                        {t.tx_type === "entrada" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {brl(Number(t.amount))}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{userName(t.created_by)}</TableCell>
                    <TableCell>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => onDelete(t.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
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

function NewTransactionDialog({ companies, accounts }: { companies: Company[]; accounts: Account[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [txType, setTxType] = useState<"entrada" | "saida">("entrada");
  const [payment, setPayment] = useState<string>("pix");
  const [loading, setLoading] = useState(false);

  const companyAccounts = accounts.filter((a) => a.company_id === companyId);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!companyId || !accountId) return toast.error("Selecione empresa e conta");
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("cash_transactions").insert({
      company_id: companyId,
      account_id: accountId,
      tx_date: String(fd.get("tx_date")),
      client_name: String(fd.get("client_name") || "") || null,
      budget_number: String(fd.get("budget_number") || "") || null,
      description: String(fd.get("description")),
      amount: Number(String(fd.get("amount")).replace(",", ".")),
      payment_method: payment as never,
      tx_type: txType,
      created_by: user?.id,
    } as never);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Lançamento criado");
    qc.invalidateQueries({ queryKey: ["caixa-tx"] });
    qc.invalidateQueries({ queryKey: ["dashboard-data"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" /> Novo Lançamento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Lançamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Tabs value={txType} onValueChange={(v) => setTxType(v as "entrada" | "saida")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrada">
                <ArrowUpRight className="mr-1 h-4 w-4" /> Entrada
              </TabsTrigger>
              <TabsTrigger value="saida">
                <ArrowDownRight className="mr-1 h-4 w-4" /> Saída
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setAccountId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={!companyId}>
                <SelectTrigger><SelectValue placeholder={companyId ? "Selecione" : "Escolha empresa"} /></SelectTrigger>
                <SelectContent>
                  {companyAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx_date">Data</Label>
              <Input id="tx_date" name="tx_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input id="amount" name="amount" type="number" step="0.01" min="0" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="client_name">Cliente (opcional)</Label>
              <Input id="client_name" name="client_name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget_number">Nº do Orçamento</Label>
              <Input id="budget_number" name="budget_number" placeholder="Ex.: 12345" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" name="description" required />
          </div>

          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <Select value={payment} onValueChange={setPayment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SupplyCard({
  company, supply, date, canWrite, onSaved,
}: {
  company: Company;
  supply: Supply | undefined;
  date: string;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(supply ? String(supply.amount) : "");
  const [saving, setSaving] = useState(false);

  // Reset local input when supply/date changes
  const supplyKey = `${supply?.id ?? "none"}-${date}`;
  const [lastKey, setLastKey] = useState(supplyKey);
  if (lastKey !== supplyKey) {
    setLastKey(supplyKey);
    setVal(supply ? String(supply.amount) : "");
    setEditing(false);
  }

  const save = async () => {
    const amount = Number(val.replace(",", "."));
    if (!isFinite(amount) || amount < 0) return toast.error("Valor inválido");
    setSaving(true);
    const payload = {
      company_id: company.id,
      supply_date: date,
      amount,
      created_by: user?.id,
    };
    const { error } = await (supabase.from("daily_cash_supplies" as never) as never as {
      upsert: (v: unknown, o: { onConflict: string }) => Promise<{ error: Error | null }>;
    }).upsert(payload, { onConflict: "company_id,supply_date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Suprimento salvo");
    setEditing(false);
    onSaved();
  };

  return (
    <div className="rounded-lg border bg-secondary/40 p-3">
      <div className="text-xs text-muted-foreground">{company.name}</div>
      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="h-8"
          />
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "..." : "OK"}</Button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Suprimento</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{brl(Number(supply?.amount ?? 0))}</span>
            {canWrite && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
                Editar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
