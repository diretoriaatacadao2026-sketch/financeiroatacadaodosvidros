import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { ChevronLeft, ChevronRight, Lock, Unlock, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dashboard — Glass ERP" }] }),
  component: DashboardWrapper,
});

interface TxRow {
  id: string;
  tx_date: string;
  amount: number;
  tx_type: "entrada" | "saida";
  company_id: string;
}
interface Company { id: string; name: string }
interface Closing { company_id: string; closing_date: string }

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const monthDataQuery = (month: string, companyFilter: string) =>
  queryOptions({
    queryKey: ["dashboard-month", month, companyFilter],
    queryFn: async () => {
      const [y, m] = month.split("-").map(Number);
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      const startISO = isoLocal(first);
      const endISO = isoLocal(last);

      const txPromise = fetchAllRows<TxRow>(() => {
        let q = supabase
          .from("cash_transactions")
          .select("id, tx_date, amount, tx_type, company_id")
          .gte("tx_date", startISO)
          .lte("tx_date", endISO)
          .order("tx_date", { ascending: true })
          .order("id", { ascending: true });
        if (companyFilter !== "all") q = q.eq("company_id", companyFilter);
        return q as never;
      });

      const clPromise = fetchAllRows<Closing>(() => {
        let q = supabase
          .from("cash_closings" as never)
          .select("company_id, closing_date")
          .gte("closing_date", startISO)
          .lte("closing_date", endISO)
          .order("closing_date", { ascending: true });
        if (companyFilter !== "all") q = q.eq("company_id", companyFilter);
        return q as never;
      });

      const [tx, closings, { data: companies }] = await Promise.all([
        txPromise,
        clPromise,
        supabase.from("companies").select("id, name").order("name"),
      ]);
      return {
        tx,
        closings,
        companies: (companies ?? []) as Company[],
        month,
        first,
        last,
      };
    },
  });


function DashboardWrapper() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Carregando calendário...</div>}>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const month = monthKey(cursor);
  const { data } = useSuspenseQuery(monthDataQuery(month, companyFilter));
  const navigate = useNavigate();

  const totalCompanies = companyFilter === "all"
    ? data.companies.length || 1
    : 1;

  // Aggregate by date
  const byDate = useMemo(() => {
    const m = new Map<string, { entradas: number; saidas: number; companies: Set<string> }>();
    data.tx.forEach((t) => {
      const key = t.tx_date;
      const row = m.get(key) ?? { entradas: 0, saidas: 0, companies: new Set<string>() };
      if (t.tx_type === "entrada") row.entradas += Number(t.amount);
      else row.saidas += Number(t.amount);
      row.companies.add(t.company_id);
      m.set(key, row);
    });
    return m;
  }, [data.tx]);

  const closingsByDate = useMemo(() => {
    const m = new Map<string, Set<string>>();
    data.closings.forEach((c) => {
      const set = m.get(c.closing_date) ?? new Set<string>();
      set.add(c.company_id);
      m.set(c.closing_date, set);
    });
    return m;
  }, [data.closings]);

  const monthTotals = useMemo(() => {
    let e = 0, s = 0;
    data.tx.forEach((t) => {
      if (t.tx_type === "entrada") e += Number(t.amount);
      else s += Number(t.amount);
    });
    return { entradas: e, saidas: s, saldo: e - s };
  }, [data.tx]);

  // Build calendar grid (Sun..Sat)
  const first = data.first;
  const last = data.last;
  const startWeekday = first.getDay();
  const daysInMonth = last.getDate();
  const cells: Array<{ date: Date | null; iso: string | null }> = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(first.getFullYear(), first.getMonth(), d);
    cells.push({ date: dt, iso: isoLocal(dt) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const todayISO = isoLocal(new Date());


  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  // Max abs value for shade intensity
  const maxAbs = Math.max(1, ...Array.from(byDate.values()).map((r) => Math.abs(r.entradas - r.saidas)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suas vendas</h1>
          <p className="text-sm text-muted-foreground">Saldo diário — clique em um dia para ver o extrato</p>
        </div>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {data.companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase">{monthLabel}</span>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-xl font-bold">{brl(monthTotals.saldo)}</div>
          <div className="text-xs text-muted-foreground">Saldo do mês</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase">Entradas</span>
            <ArrowUpRight className="h-4 w-4 text-[color:var(--success)]" />
          </div>
          <div className="mt-2 text-xl font-bold text-[color:var(--success)]">{brl(monthTotals.entradas)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase">Saídas</span>
            <ArrowDownRight className="h-4 w-4 text-destructive" />
          </div>
          <div className="mt-2 text-xl font-bold text-destructive">{brl(monthTotals.saidas)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase">Empresas</span>
          </div>
          <div className="mt-2 text-xl font-bold">{data.companies.length}</div>
          <div className="text-xs text-muted-foreground">
            {companyFilter === "all" ? "Consolidado" : data.companies.find(c => c.id === companyFilter)?.name}
          </div>
        </Card>
      </div>

      <Card className="p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="text-lg font-semibold capitalize">{monthLabel}</div>
          <div className="w-16" />
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {cells.map((cell, i) => {
            if (!cell.iso || !cell.date) {
              return <div key={i} className="aspect-square rounded-md border border-dashed border-border/40" />;
            }
            const rec = byDate.get(cell.iso);
            const saldo = rec ? rec.entradas - rec.saidas : 0;
            const isFuture = cell.iso > todayISO;
            const closedCount = closingsByDate.get(cell.iso)?.size ?? 0;
            const dayCompanies = companyFilter === "all" ? totalCompanies : 1;
            const allClosed = closedCount >= dayCompanies && closedCount > 0;
            const someClosed = closedCount > 0 && !allClosed;

            const intensity = Math.min(1, Math.abs(saldo) / maxAbs);
            const bgStyle = saldo === 0
              ? undefined
              : saldo > 0
                ? { backgroundColor: `color-mix(in oklab, hsl(140 70% 45%) ${20 + Math.round(intensity * 55)}%, transparent)` }
                : { backgroundColor: `color-mix(in oklab, hsl(0 75% 55%) ${20 + Math.round(intensity * 55)}%, transparent)` };

            return (
              <Link
                key={i}
                to="/extrato/$date"
                params={{ date: cell.iso }}
                search={{ pm: "all" as const }}
                className={cn(
                  "group relative flex aspect-square flex-col justify-between rounded-md border p-1.5 text-left transition-all hover:scale-[1.02] hover:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary",
                  cell.iso === todayISO && "ring-2 ring-primary",
                  isFuture && "opacity-50",
                )}
                style={bgStyle}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{cell.date.getDate()}</span>
                  {allClosed && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1 py-0.5 text-[9px] font-medium text-foreground shadow-sm">
                      <Lock className="h-2.5 w-2.5" /> Fechado
                    </span>
                  )}
                  {someClosed && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1 py-0.5 text-[9px] font-medium text-amber-500 shadow-sm">
                      <Lock className="h-2.5 w-2.5" /> Parcial
                    </span>
                  )}
                  {!allClosed && !someClosed && rec && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-background/70 px-1 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
                      <Unlock className="h-2.5 w-2.5" /> Aberto
                    </span>
                  )}
                </div>
                <div className="text-right">
                  {rec ? (
                    <div className={cn(
                      "text-xs font-bold leading-tight tabular-nums",
                      saldo >= 0 ? "text-foreground" : "text-destructive-foreground",
                    )}>
                      {saldo >= 0 ? "" : "-"}R${Math.abs(saldo).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground/60">—</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: "hsl(140 70% 45% / 0.6)" }} /> Saldo positivo</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: "hsl(0 75% 55% / 0.6)" }} /> Saldo negativo</span>
          <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Caixa fechado</span>
          <span className="inline-flex items-center gap-1"><Unlock className="h-3 w-3" /> Caixa aberto</span>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground" onClick={() => navigate({ to: "/caixa" })}>
        Dica: use <span className="font-medium text-foreground">Fechamento de Caixa</span> para marcar um dia como fechado.
      </p>
    </div>
  );
}
