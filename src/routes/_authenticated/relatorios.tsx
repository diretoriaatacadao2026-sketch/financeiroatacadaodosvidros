import { createFileRoute } from "@tanstack/react-router";
import { Suspense, useMemo, useState } from "react";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR, PAYMENT_METHODS, FUEL_PAYMENT_METHODS } from "@/lib/format";
import { Printer, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  ssr: false,
  head: () => ({ meta: [{ title: "Relatórios — Glass ERP" }] }),
  component: () => (
    <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
      <RelatoriosPage />
    </Suspense>
  ),
});

type Period = "daily" | "weekly" | "monthly" | "custom";

function getRange(period: Period, anchor: string): { start: string; end: string } {
  const d = new Date(anchor + "T00:00:00");
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  if (period === "daily") return { start: fmt(d), end: fmt(d) };
  if (period === "weekly") {
    const day = d.getDay(); // 0=Sun
    const start = new Date(d); start.setDate(d.getDate() - day);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start: fmt(start), end: fmt(end) };
  }
  if (period === "monthly") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: fmt(start), end: fmt(end) };
  }
  return { start: fmt(d), end: fmt(d) };
}

const companiesQuery = queryOptions({
  queryKey: ["rel-companies"],
  queryFn: async () => {
    const { data, error } = await supabase.from("companies").select("id, name").order("name");
    if (error) throw error;
    return data ?? [];
  },
});

function RelatoriosPage() {
  const { data: companies } = useSuspenseQuery(companiesQuery);
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<Period>("monthly");
  const [anchor, setAnchor] = useState(today);
  const [customStart, setCustomStart] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [companyId, setCompanyId] = useState<string>("all");
  const [tab, setTab] = useState("financeiro");

  const range = period === "custom"
    ? { start: customStart, end: customEnd }
    : getRange(period, anchor);

  const companyName = companyId === "all"
    ? "Todas as empresas"
    : companies.find((c) => c.id === companyId)?.name ?? "—";

  const periodLabel = period === "daily" ? "Diário"
    : period === "weekly" ? "Semanal"
    : period === "monthly" ? "Mensal" : "Personalizado";

  return (
    <div className="space-y-6 print-area">
      <div className="flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Gere relatórios financeiros, de feedback e abastecimento.</p>
        </div>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Imprimir / PDF
        </Button>
      </div>

      <Card className="p-4 no-print">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {period === "custom" ? (
            <>
              <div>
                <Label>De</Label>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </div>
              <div>
                <Label>Até</Label>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            </>
          ) : (
            <div>
              <Label>Data de referência</Label>
              <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="hidden print:block">
        <h2 className="text-xl font-bold">Relatório {tab === "financeiro" ? "Financeiro" : tab === "feedback" ? "Feedback de Montadores" : "Abastecimentos"}</h2>
        <p className="text-sm">Período: {periodLabel} — {dateBR(range.start)} a {dateBR(range.end)}</p>
        <p className="text-sm">Empresa: {companyName}</p>
        <p className="text-sm">Emitido em: {new Date().toLocaleString("pt-BR")}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="no-print">
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
          <TabsTrigger value="abastecimentos">Abastecimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="financeiro">
          <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
            <RelFinanceiro key={`${range.start}-${range.end}-${companyId}`} start={range.start} end={range.end} companyId={companyId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="feedback">
          <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
            <RelFeedback key={`${range.start}-${range.end}-${companyId}`} start={range.start} end={range.end} companyId={companyId} />
          </Suspense>
        </TabsContent>
        <TabsContent value="abastecimentos">
          <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
            <RelAbastecimentos key={`${range.start}-${range.end}-${companyId}`} start={range.start} end={range.end} companyId={companyId} />
          </Suspense>
        </TabsContent>
      </Tabs>

    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </Card>
  );
}

function RelFinanceiro({ start, end, companyId }: { start: string; end: string; companyId: string }) {
  const { data } = useSuspenseQuery({
    queryKey: ["rel-fin", start, end, companyId],
    queryFn: async () => {
      let q = supabase
        .from("cash_transactions")
        .select("id, tx_date, client_name, budget_number, description, amount, payment_method, tx_type, company_id, account_id")
        .gte("tx_date", start).lte("tx_date", end)
        .order("tx_date", { ascending: true });
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const companies = useSuspenseQuery(companiesQuery).data;
  const accountsQ = useSuspenseQuery({
    queryKey: ["rel-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cash_accounts").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const cmap = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies]);
  const amap = useMemo(() => Object.fromEntries(accountsQ.data.map((a) => [a.id, a.name])), [accountsQ.data]);
  const entradas = data.filter((t) => t.tx_type === "entrada").reduce((s, t) => s + Number(t.amount), 0);
  const saidas = data.filter((t) => t.tx_type === "saida").reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Entradas" value={brl(entradas)} accent="text-emerald-600" />
        <Kpi label="Saídas" value={brl(saidas)} accent="text-rose-600" />
        <Kpi label="Saldo" value={brl(entradas - saidas)} />
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Orçamento</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Pagto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sem lançamentos no período.</TableCell></TableRow>
            ) : data.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{dateBR(t.tx_date)}</TableCell>
                <TableCell>{cmap[t.company_id] ?? "—"}</TableCell>
                <TableCell>{amap[t.account_id] ?? "—"}</TableCell>
                <TableCell>{t.client_name ?? "—"}</TableCell>
                <TableCell>{t.budget_number ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{t.description}</TableCell>
                <TableCell>{PAYMENT_METHODS.find((p) => p.value === t.payment_method)?.label ?? t.payment_method}</TableCell>
                <TableCell className={t.tx_type === "entrada" ? "text-emerald-600" : "text-rose-600"}>
                  {t.tx_type === "entrada" ? "Entrada" : "Saída"}
                </TableCell>
                <TableCell className="text-right">{brl(Number(t.amount))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function RelFeedback({ start, end, companyId }: { start: string; end: string; companyId: string }) {
  const installersQ = useSuspenseQuery({
    queryKey: ["rel-installers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("installers").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data } = useSuspenseQuery({
    queryKey: ["rel-feedback", start, end, companyId],
    queryFn: async () => {
      let q = supabase
        .from("installer_feedbacks")
        .select("id, installer_id, company_id, client_name, rating, comment, service_date")
        .gte("service_date", start).lte("service_date", end)
        .order("service_date", { ascending: false });
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const companies = useSuspenseQuery(companiesQuery).data;
  const cmap = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies]);
  const imap = useMemo(() => Object.fromEntries(installersQ.data.map((i) => [i.id, i.name])), [installersQ.data]);

  const ranking = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const f of data) {
      const x = m.get(f.installer_id) ?? { sum: 0, n: 0 };
      x.sum += Number(f.rating); x.n += 1;
      m.set(f.installer_id, x);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, name: imap[id] ?? "—", avg: v.sum / v.n, count: v.n }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [data, imap]);

  const overall = data.length ? data.reduce((s, f) => s + Number(f.rating), 0) / data.length : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total de avaliações" value={String(data.length)} />
        <Kpi label="Média geral" value={overall.toFixed(2) + " ⭐"} />
        <Kpi label="Montadores avaliados" value={String(ranking.length)} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-medium text-sm">Ranking</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Montador</TableHead>
              <TableHead className="text-right">Avaliações</TableHead>
              <TableHead className="text-right">Média</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranking.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem avaliações no período.</TableCell></TableRow>
            ) : ranking.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell>{i + 1}º</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-right">{r.avg.toFixed(2)} ⭐</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b font-medium text-sm">Avaliações</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Montador</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Nota</TableHead>
              <TableHead>Comentário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">—</TableCell></TableRow>
            ) : data.map((f) => (
              <TableRow key={f.id}>
                <TableCell>{dateBR(f.service_date)}</TableCell>
                <TableCell>{imap[f.installer_id] ?? "—"}</TableCell>
                <TableCell>{cmap[f.company_id] ?? "—"}</TableCell>
                <TableCell>{f.client_name ?? "—"}</TableCell>
                <TableCell className="text-right">{f.rating} ⭐</TableCell>
                <TableCell className="max-w-md truncate">{f.comment ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function RelAbastecimentos({ start, end, companyId }: { start: string; end: string; companyId: string }) {
  const vehiclesQ = useSuspenseQuery({
    queryKey: ["rel-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("id, plate, model");
      if (error) throw error;
      return data ?? [];
    },
  });
  const providersQ = useSuspenseQuery({
    queryKey: ["rel-providers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fuel_providers").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data } = useSuspenseQuery({
    queryKey: ["rel-fuel", start, end, companyId],
    queryFn: async () => {
      let q = supabase
        .from("fuel_refuels")
        .select("id, company_id, vehicle_id, provider_id, refuel_date, fuel_type, liters, price_per_liter, total_amount, payment_method, requisition_number")
        .gte("refuel_date", start).lte("refuel_date", end)
        .order("refuel_date", { ascending: true });
      if (companyId !== "all") q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
  const companies = useSuspenseQuery(companiesQuery).data;
  const cmap = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies]);
  const vmap = useMemo(() => Object.fromEntries(vehiclesQ.data.map((v) => [v.id, `${v.plate}${v.model ? " - " + v.model : ""}`])), [vehiclesQ.data]);
  const pmap = useMemo(() => Object.fromEntries(providersQ.data.map((p) => [p.id, p.name])), [providersQ.data]);

  const totalAmount = data.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalLiters = data.reduce((s, r) => s + Number(r.liters), 0);
  const avg = totalLiters ? totalAmount / totalLiters : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total gasto" value={brl(totalAmount)} />
        <Kpi label="Litros" value={totalLiters.toFixed(2) + " L"} />
        <Kpi label="Preço médio / L" value={brl(avg)} />
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Veículo</TableHead>
              <TableHead>Posto</TableHead>
              <TableHead>Combustível</TableHead>
              <TableHead>Requisição</TableHead>
              <TableHead>Pagto</TableHead>
              <TableHead className="text-right">Litros</TableHead>
              <TableHead className="text-right">R$/L</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Sem abastecimentos no período.</TableCell></TableRow>
            ) : data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{dateBR(r.refuel_date)}</TableCell>
                <TableCell>{cmap[r.company_id] ?? "—"}</TableCell>
                <TableCell>{r.vehicle_id ? vmap[r.vehicle_id] ?? "—" : "—"}</TableCell>
                <TableCell>{r.provider_id ? pmap[r.provider_id] ?? "—" : "—"}</TableCell>

                <TableCell>{r.fuel_type}</TableCell>
                <TableCell>{r.requisition_number ?? "—"}</TableCell>
                <TableCell>{FUEL_PAYMENT_METHODS.find((p) => p.value === r.payment_method)?.label ?? r.payment_method ?? "—"}</TableCell>
                <TableCell className="text-right">{Number(r.liters).toFixed(2)}</TableCell>
                <TableCell className="text-right">{brl(Number(r.price_per_liter))}</TableCell>
                <TableCell className="text-right">{brl(Number(r.total_amount))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
