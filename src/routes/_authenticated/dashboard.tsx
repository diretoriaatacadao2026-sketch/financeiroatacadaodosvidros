import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Wallet, Building2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dashboard — Glass ERP" }] }),
  component: Dashboard,
});

interface TxRow {
  id: string;
  tx_date: string;
  amount: number;
  tx_type: "entrada" | "saida";
  company_id: string;
  account_id: string;
}
interface Company { id: string; name: string }

const dataQuery = queryOptions({
  queryKey: ["dashboard-data"],
  queryFn: async () => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [{ data: tx }, { data: companies }] = await Promise.all([
      supabase
        .from("cash_transactions")
        .select("id, tx_date, amount, tx_type, company_id, account_id")
        .gte("tx_date", since.toISOString().slice(0, 10))
        .order("tx_date", { ascending: true }),
      supabase.from("companies").select("id, name").order("name"),
    ]);
    return {
      tx: (tx ?? []) as TxRow[],
      companies: (companies ?? []) as Company[],
    };
  },
});

function Dashboard() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Carregando indicadores...</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { data } = useSuspenseQuery(dataQuery);
  const today = new Date().toISOString().slice(0, 10);
  const todayTx = data.tx.filter((t) => t.tx_date === today);
  const entradasHoje = todayTx.filter((t) => t.tx_type === "entrada").reduce((s, t) => s + Number(t.amount), 0);
  const saidasHoje = todayTx.filter((t) => t.tx_type === "saida").reduce((s, t) => s + Number(t.amount), 0);
  const saldoConsolidado = data.tx.reduce(
    (s, t) => s + (t.tx_type === "entrada" ? 1 : -1) * Number(t.amount),
    0,
  );

  const byCompany = data.companies.map((c) => {
    const txC = data.tx.filter((t) => t.company_id === c.id);
    const saldo = txC.reduce(
      (s, t) => s + (t.tx_type === "entrada" ? 1 : -1) * Number(t.amount),
      0,
    );
    return { name: c.name.replace("Vidraçaria ", "").replace("Atacadão ", "Atc. ").replace("Mercadão ", "Mrc. "), saldo };
  });

  const flowByDate = (() => {
    const map = new Map<string, { date: string; entradas: number; saidas: number }>();
    data.tx.forEach((t) => {
      const k = t.tx_date;
      const row = map.get(k) ?? { date: k, entradas: 0, saidas: 0 };
      if (t.tx_type === "entrada") row.entradas += Number(t.amount);
      else row.saidas += Number(t.amount);
      map.set(k, row);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, date: r.date.slice(5).replace("-", "/") }));
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada das 4 empresas — últimos 30 dias.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Saldo consolidado"
          value={brl(saldoConsolidado)}
          icon={<Wallet className="h-4 w-4" />}
          accent="primary"
        />
        <Kpi
          label="Entradas (hoje)"
          value={brl(entradasHoje)}
          icon={<ArrowUpRight className="h-4 w-4" />}
          accent="success"
        />
        <Kpi
          label="Saídas (hoje)"
          value={brl(saidasHoje)}
          icon={<ArrowDownRight className="h-4 w-4" />}
          accent="destructive"
        />
        <Kpi
          label="Empresas ativas"
          value={String(data.companies.length)}
          icon={<Building2 className="h-4 w-4" />}
          accent="primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Fluxo de caixa diário</h3>
              <p className="text-xs text-muted-foreground">Entradas vs saídas — 30 dias</p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-72">
            {flowByDate.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={flowByDate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={false}
                    name="Entradas"
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    dot={false}
                    name="Saídas"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4">
            <h3 className="font-semibold">Saldo por empresa</h3>
            <p className="text-xs text-muted-foreground">Acumulado dos 30 dias</p>
          </div>
          <div className="h-72">
            {byCompany.every((b) => b.saldo === 0) ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCompany} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Bar dataKey="saldo" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados suficientes ainda. Lance movimentações no Caixa.
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "primary" | "success" | "destructive";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`grid h-8 w-8 place-items-center rounded-md ${colorMap[accent]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight">{value}</div>
    </Card>
  );
}
