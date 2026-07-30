import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { brl, dateBR, FUEL_PAYMENT_METHODS } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";
import { Fuel, Plus, Trash2, Truck, Building2, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/abastecimentos")({
  ssr: false,
  head: () => ({ meta: [{ title: "Abastecimentos — Glass ERP" }] }),
  component: () => (
    <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
      <AbastecimentosPage />
    </Suspense>
  ),
});

interface Company { id: string; name: string }
interface Vehicle { id: string; company_id: string; plate: string; model: string | null; active: boolean }
interface Provider { id: string; company_id: string; name: string; active: boolean }
interface Refuel {
  id: string; company_id: string; vehicle_id: string; provider_id: string | null;
  refuel_date: string; fuel_type: string; liters: number; price_per_liter: number;
  total_amount: number; odometer: number | null; driver_name: string | null; notes: string | null;
  payment_method: string | null; requisition_number: string | null; credit_id: string | null;
  created_by: string | null;
}
interface FuelCredit {
  id: string; company_id: string; provider_id: string | null; provider_name: string;
  cnpj: string | null; amount: number; paid_date: string; notes: string | null;
  created_by: string | null; closed_at: string | null;
}

const FUEL_TYPES = [
  { value: "diesel", label: "Diesel" },
  { value: "diesel_s10", label: "Diesel S-10" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "gnv", label: "GNV" },
  { value: "arla", label: "Arla 32" },
];

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const baseDataQuery = queryOptions({
  queryKey: ["abastecimentos", "base"],
  queryFn: async () => {
    const [companiesRes, vehiclesRes, providersRes, creditsRes] = await Promise.all([
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("vehicles").select("id, company_id, plate, model, active").order("plate"),
      supabase.from("fuel_providers").select("id, company_id, name, active").order("name"),
      (supabase.from("fuel_credits" as never) as never as { select: (q: string) => Promise<{ data: FuelCredit[] | null; error: Error | null }> })
        .select("id, company_id, provider_id, provider_name, cnpj, amount, paid_date, notes, created_by, closed_at"),
    ]);
    if (vehiclesRes.error) throw vehiclesRes.error;
    if (providersRes.error) throw providersRes.error;
    return {
      companies: (companiesRes.data ?? []) as Company[],
      vehicles: (vehiclesRes.data ?? []) as Vehicle[],
      providers: (providersRes.data ?? []) as Provider[],
      credits: (creditsRes.data ?? []) as FuelCredit[],
    };
  },
});

interface Filters {
  companyId: string;
  vehicleId: string;
  providerId: string;
  from: string;
  to: string;
}

const refuelsQuery = (f: Filters) => queryOptions({
  queryKey: ["abastecimentos", "list", f],
  queryFn: async () => {
    let q = supabase
      .from("fuel_refuels")
      .select("id, company_id, vehicle_id, provider_id, refuel_date, fuel_type, liters, price_per_liter, total_amount, odometer, driver_name, notes, payment_method, requisition_number, credit_id, created_by")
      .gte("refuel_date", f.from)
      .lte("refuel_date", f.to)
      .order("refuel_date", { ascending: false })
      .limit(1000);
    if (f.companyId !== "all") q = q.eq("company_id", f.companyId);
    if (f.vehicleId !== "all") q = q.eq("vehicle_id", f.vehicleId);
    if (f.providerId !== "all") q = q.eq("provider_id", f.providerId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Refuel[];
  },
});

function AbastecimentosPage() {
  const { hasRole } = useAuth();
  const { display: userName } = useUserNames();
  const canManage = hasRole(["admin", "gestor", "financeiro"]);
  const canWrite = hasRole(["admin", "gestor", "financeiro", "vendedor"]);
  const canDelete = hasRole(["admin", "gestor", "financeiro"]);

  const [filters, setFilters] = useState<Filters>({
    companyId: "all",
    vehicleId: "all",
    providerId: "all",
    from: daysAgo(30),
    to: today(),
  });

  const { data: base } = useSuspenseQuery(baseDataQuery);
  const { data: refuels } = useSuspenseQuery(refuelsQuery(filters));
  const qc = useQueryClient();

  const filteredVehicles = useMemo(
    () => filters.companyId === "all" ? base.vehicles : base.vehicles.filter(v => v.company_id === filters.companyId),
    [base.vehicles, filters.companyId],
  );
  const filteredProviders = useMemo(
    () => filters.companyId === "all" ? base.providers : base.providers.filter(p => p.company_id === filters.companyId),
    [base.providers, filters.companyId],
  );

  useEffect(() => {
    if (filters.vehicleId !== "all" && !filteredVehicles.find(v => v.id === filters.vehicleId)) {
      setFilters(f => ({ ...f, vehicleId: "all" }));
    }
    if (filters.providerId !== "all" && !filteredProviders.find(p => p.id === filters.providerId)) {
      setFilters(f => ({ ...f, providerId: "all" }));
    }
  }, [filters.companyId, filteredVehicles, filteredProviders, filters.vehicleId, filters.providerId]);

  const totals = useMemo(() => {
    const totalAmount = refuels.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalLiters = refuels.reduce((s, r) => s + Number(r.liters), 0);
    const avgPrice = totalLiters > 0 ? totalAmount / totalLiters : 0;
    return { totalAmount, totalLiters, avgPrice, count: refuels.length };
  }, [refuels]);

  const creditBalances = useMemo(() => {
    // For every credit: balance = amount - sum of refuels where credit_id = this.id
    const usedByCredit = new Map<string, number>();
    refuels.forEach((r) => {
      if (r.credit_id) usedByCredit.set(r.credit_id, (usedByCredit.get(r.credit_id) ?? 0) + Number(r.total_amount));
    });
    return base.credits.map((c) => ({
      credit: c,
      used: usedByCredit.get(c.id) ?? 0,
      balance: Number(c.amount) - (usedByCredit.get(c.id) ?? 0),
    }));
  }, [base.credits, refuels]);

  const creditsFiltered = useMemo(
    () => filters.companyId === "all" ? creditBalances : creditBalances.filter(c => c.credit.company_id === filters.companyId),
    [creditBalances, filters.companyId],
  );
  const openCredits = useMemo(
    () => creditsFiltered.filter(c => !c.credit.closed_at),
    [creditsFiltered],
  );
  const closedCredits = useMemo(
    () => creditsFiltered
      .filter(c => c.credit.closed_at)
      .sort((a, b) => (b.credit.closed_at ?? "").localeCompare(a.credit.closed_at ?? "")),
    [creditsFiltered],
  );
  const totalCreditBalance = openCredits.reduce((s, c) => s + c.balance, 0);
  const [selectedClosedCredit, setSelectedClosedCredit] = useState<FuelCredit | null>(null);

  const deleteRefuel = async (id: string) => {
    if (!confirm("Excluir este abastecimento?")) return;
    const { error } = await supabase.from("fuel_refuels").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Abastecimento excluído");
    qc.invalidateQueries({ queryKey: ["abastecimentos"] });
  };

  const deleteCredit = async (id: string) => {
    if (!confirm("Excluir este crédito antecipado?")) return;
    const { error } = await (supabase.from("fuel_credits" as never) as never as { delete: () => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } }).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Crédito excluído");
    qc.invalidateQueries({ queryKey: ["abastecimentos"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Controle de Abastecimentos</h1>
          <p className="text-sm text-muted-foreground">Consumo de combustível por empresa, veículo e prestador.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && <NewVehicleDialog companies={base.companies} />}
          {canManage && <NewProviderDialog companies={base.companies} />}
          {canManage && <NewCreditDialog companies={base.companies} providers={base.providers} />}
          {canWrite && base.vehicles.length > 0 && (
            <NewRefuelDialog companies={base.companies} vehicles={base.vehicles} providers={base.providers} credits={creditBalances} />
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Empresa</Label>
            <Select value={filters.companyId} onValueChange={(v) => setFilters(f => ({ ...f, companyId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {base.companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Veículo</Label>
            <Select value={filters.vehicleId} onValueChange={(v) => setFilters(f => ({ ...f, vehicleId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filteredVehicles.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` — ${v.model}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prestador / Posto</Label>
            <Select value={filters.providerId} onValueChange={(v) => setFilters(f => ({ ...f, providerId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {filteredProviders.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="date" value={filters.from} onChange={(e) => setFilters(f => ({ ...f, from: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={filters.to} onChange={(e) => setFilters(f => ({ ...f, to: e.target.value }))} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Total gasto</div>
          <div className="mt-2 text-2xl font-bold">{brl(totals.totalAmount)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Litros</div>
          <div className="mt-2 text-2xl font-bold">{totals.totalLiters.toFixed(2)} L</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Preço médio/L</div>
          <div className="mt-2 text-2xl font-bold">{brl(totals.avgPrice)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Lançamentos</div>
          <div className="mt-2 text-2xl font-bold">{totals.count}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" /> Saldo de Créditos
          </div>
          <div className="mt-2 text-2xl font-bold text-[color:var(--success)]">{brl(totalCreditBalance)}</div>
        </Card>
      </div>

      {openCredits.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b p-4">
            <Wallet className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Créditos Antecipados</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pago em</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Posto</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="text-right">Valor pago</TableHead>
                  <TableHead className="text-right">Consumido</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {openCredits.map(({ credit, used, balance }) => {
                  const comp = base.companies.find(c => c.id === credit.company_id);
                  return (
                    <TableRow key={credit.id}>
                      <TableCell className="text-sm">{dateBR(credit.paid_date)}</TableCell>
                      <TableCell className="text-sm">{comp?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{credit.provider_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{credit.cnpj ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{brl(Number(credit.amount))}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{brl(used)}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${balance <= 0 ? "text-destructive" : "text-[color:var(--success)]"}`}>
                        {brl(balance)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{userName(credit.created_by)}</TableCell>
                      <TableCell>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => deleteCredit(credit.id)}>
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
      )}

      {closedCredits.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b p-4">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Créditos Fechados</h3>
            <span className="text-xs text-muted-foreground">(saldo zerado — clique para ver os abastecimentos)</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Posto</TableHead>
                  <TableHead className="text-right">Valor do crédito</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {closedCredits.map(({ credit }) => {
                  const comp = base.companies.find(c => c.id === credit.company_id);
                  return (
                    <TableRow
                      key={credit.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedClosedCredit(credit)}
                    >
                      <TableCell className="text-sm">
                        {dateBR(credit.paid_date)} — {credit.closed_at ? dateBR(credit.closed_at) : "—"}
                        <Badge variant="secondary" className="ml-2 font-normal">Fechado</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{comp?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{credit.provider_name}</TableCell>
                      <TableCell className="text-right text-sm">{brl(Number(credit.amount))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{userName(credit.created_by)}</TableCell>
                      <TableCell>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); deleteCredit(credit.id); }}
                          >
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
      )}

      <ClosedCreditDetailsDialog
        credit={selectedClosedCredit}
        company={selectedClosedCredit ? base.companies.find(c => c.id === selectedClosedCredit.company_id) ?? null : null}
        vehicles={base.vehicles}
        providers={base.providers}
        onOpenChange={(open) => { if (!open) setSelectedClosedCredit(null); }}
      />

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <Fuel className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Abastecimentos</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Prestador</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">R$/L</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Requisição</TableHead>
                <TableHead className="text-right">KM</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {refuels.length === 0 && (
                <TableRow><TableCell colSpan={13} className="py-10 text-center text-muted-foreground">Nenhum abastecimento no período.</TableCell></TableRow>
              )}
              {refuels.map((r) => {
                const v = base.vehicles.find(x => x.id === r.vehicle_id);
                const p = base.providers.find(x => x.id === r.provider_id);
                const c = base.companies.find(x => x.id === r.company_id);
                const ft = FUEL_TYPES.find(x => x.value === r.fuel_type);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{dateBR(r.refuel_date)}</TableCell>
                    <TableCell className="text-sm">{c?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{v?.plate ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-normal">{ft?.label ?? r.fuel_type}</Badge></TableCell>
                    <TableCell className="text-right text-sm">{Number(r.liters).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">{brl(Number(r.price_per_liter))}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{brl(Number(r.total_amount))}</TableCell>
                    <TableCell>
                      {r.payment_method ? (
                        <Badge variant={r.payment_method === "credito_antecipado" ? "default" : "outline"} className="font-normal">
                          {FUEL_PAYMENT_METHODS.find(m => m.value === r.payment_method)?.label ?? r.payment_method}
                        </Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{r.requisition_number ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{r.odometer ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{userName(r.created_by)}</TableCell>
                    <TableCell>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => deleteRefuel(r.id)}>
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

function ClosedCreditDetailsDialog({
  credit, company, vehicles, providers, onOpenChange,
}: {
  credit: FuelCredit | null;
  company: Company | null;
  vehicles: Vehicle[];
  providers: Provider[];
  onOpenChange: (open: boolean) => void;
}) {
  const { display: userName } = useUserNames();

  const { data: refuels, isLoading } = useQuery({
    queryKey: ["abastecimentos", "credit-history", credit?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuel_refuels")
        .select("id, vehicle_id, provider_id, refuel_date, fuel_type, liters, price_per_liter, total_amount, odometer, driver_name, notes, requisition_number, created_by")
        .eq("credit_id", credit!.id)
        .order("refuel_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Refuel[];
    },
    enabled: !!credit,
  });

  const total = (refuels ?? []).reduce((s, r) => s + Number(r.total_amount), 0);

  return (
    <Dialog open={!!credit} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Crédito fechado — {credit?.provider_name}
          </DialogTitle>
        </DialogHeader>
        {credit && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4 text-sm">
              <div>
                <div className="text-muted-foreground">Empresa</div>
                <div className="font-medium">{company?.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Aberto em</div>
                <div className="font-medium">{dateBR(credit.paid_date)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Fechado em</div>
                <div className="font-medium">{credit.closed_at ? dateBR(credit.closed_at) : "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Valor do crédito</div>
                <div className="font-medium">{brl(Number(credit.amount))}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Prestador</TableHead>
                    <TableHead className="text-right">Litros</TableHead>
                    <TableHead className="text-right">R$/L</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Requisição</TableHead>
                    <TableHead>Registrado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                  )}
                  {!isLoading && (refuels ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhum abastecimento encontrado.</TableCell></TableRow>
                  )}
                  {(refuels ?? []).map((r) => {
                    const v = vehicles.find(x => x.id === r.vehicle_id);
                    const p = providers.find(x => x.id === r.provider_id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{dateBR(r.refuel_date)}</TableCell>
                        <TableCell className="text-sm font-medium">{v?.plate ?? "—"}</TableCell>
                        <TableCell className="text-sm">{p?.name ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm">{Number(r.liters).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-sm">{brl(Number(r.price_per_liter))}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{brl(Number(r.total_amount))}</TableCell>
                        <TableCell className="text-sm">{r.requisition_number ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{userName(r.created_by)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
              <span>Total consumido: <span className="font-semibold">{brl(total)}</span></span>
              <span className="text-muted-foreground">{(refuels ?? []).length} abastecimento(s)</span>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewVehicleDialog({ companies }: { companies: Company[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!companyId) return toast.error("Selecione a empresa");
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("vehicles").insert({
      company_id: companyId,
      plate: String(fd.get("plate")).toUpperCase(),
      model: String(fd.get("model") || "") || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Veículo cadastrado");
    qc.invalidateQueries({ queryKey: ["abastecimentos"] });
    setOpen(false);
    setCompanyId("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Truck className="mr-1 h-4 w-4" /> Veículo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Veículo</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plate">Placa</Label>
              <Input id="plate" name="plate" required maxLength={10} className="uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Modelo (opcional)</Label>
              <Input id="model" name="model" maxLength={60} />
            </div>
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

function NewProviderDialog({ companies }: { companies: Company[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!companyId) return toast.error("Selecione a empresa");
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("fuel_providers").insert({
      company_id: companyId,
      name: String(fd.get("name")),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Prestador cadastrado");
    qc.invalidateQueries({ queryKey: ["abastecimentos"] });
    setOpen(false);
    setCompanyId("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Building2 className="mr-1 h-4 w-4" /> Prestador</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Prestador / Posto</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required maxLength={100} />
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

interface CreditWithBalance { credit: FuelCredit; used: number; balance: number }

function NewCreditDialog({ companies, providers }: { companies: Company[]; providers: Provider[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [providerId, setProviderId] = useState("none");
  const [loading, setLoading] = useState(false);

  const companyProviders = companyId ? providers.filter(p => p.company_id === companyId) : [];

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!companyId) return toast.error("Selecione a empresa");
    const fd = new FormData(e.currentTarget);
    const providerName = String(fd.get("provider_name") || "").trim();
    if (!providerName) return toast.error("Informe o nome do posto");
    const amount = Number(String(fd.get("amount")).replace(",", "."));
    if (!isFinite(amount) || amount <= 0) return toast.error("Valor inválido");
    setLoading(true);
    const { error } = await (supabase.from("fuel_credits" as never) as never as { insert: (v: unknown) => Promise<{ error: Error | null }> }).insert({
      company_id: companyId,
      provider_id: providerId === "none" ? null : providerId,
      provider_name: providerName,
      cnpj: String(fd.get("cnpj") || "") || null,
      amount,
      paid_date: String(fd.get("paid_date")),
      notes: String(fd.get("notes") || "") || null,
      created_by: user?.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Crédito antecipado registrado");
    qc.invalidateQueries({ queryKey: ["abastecimentos"] });
    setOpen(false);
    setCompanyId(""); setProviderId("none");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Wallet className="mr-1 h-4 w-4" /> Crédito Antecipado</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Crédito Antecipado</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setProviderId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Posto cadastrado (opcional)</Label>
              <Select value={providerId} onValueChange={(v) => {
                setProviderId(v);
                const found = providers.find(p => p.id === v);
                if (found) {
                  const input = document.getElementById("provider_name") as HTMLInputElement | null;
                  if (input) input.value = found.name;
                }
              }} disabled={!companyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Manual —</SelectItem>
                  {companyProviders.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="provider_name">Nome do Posto</Label>
              <Input id="provider_name" name="provider_name" required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" name="cnpj" maxLength={20} placeholder="00.000.000/0000-00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Valor do crédito (R$)</Label>
              <Input id="amount" name="amount" inputMode="decimal" required placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid_date">Data do pagamento</Label>
              <Input id="paid_date" name="paid_date" type="date" required defaultValue={today()} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea id="notes" name="notes" maxLength={500} rows={2} />
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

function NewRefuelDialog({
  companies, vehicles, providers, credits,
}: { companies: Company[]; vehicles: Vehicle[]; providers: Provider[]; credits: CreditWithBalance[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [providerId, setProviderId] = useState("none");
  const [fuelType, setFuelType] = useState("diesel");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [creditId, setCreditId] = useState("none");
  const [paidAmount, setPaidAmount] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const computed = useMemo(() => {
    const amt = parseFloat(paidAmount.replace(",", "."));
    const p = parseFloat(price.replace(",", "."));
    if (!isFinite(amt) || !isFinite(p) || p <= 0) return { liters: 0, total: isFinite(amt) ? amt : 0 };
    return { liters: amt / p, total: amt };
  }, [paidAmount, price]);


  const companyVehicles = companyId ? vehicles.filter(v => v.company_id === companyId) : [];
  const companyProviders = companyId ? providers.filter(p => p.company_id === companyId) : [];
  const availableCredits = companyId
    ? credits.filter(c => c.credit.company_id === companyId && !c.credit.closed_at && c.balance > 0 &&
        (providerId === "none" || !c.credit.provider_id || c.credit.provider_id === providerId))
    : [];

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!companyId) return toast.error("Selecione a empresa");
    if (!vehicleId) return toast.error("Selecione o veículo");
    const amt = parseFloat(paidAmount.replace(",", "."));
    const p = parseFloat(price.replace(",", "."));
    if (!isFinite(amt) || amt <= 0) return toast.error("Valor pago inválido");
    if (!isFinite(p) || p <= 0) return toast.error("Preço/L inválido");
    const l = amt / p;
    if (paymentMethod === "credito_antecipado") {
      if (creditId === "none") return toast.error("Selecione o crédito antecipado a consumir");
      const c = credits.find(x => x.credit.id === creditId);
      if (!c) return toast.error("Crédito não encontrado");
      if (amt > c.balance + 0.001) return toast.error(`Saldo insuficiente. Disponível: ${brl(c.balance)}`);
    }
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("fuel_refuels").insert({
      company_id: companyId,
      vehicle_id: vehicleId,
      provider_id: providerId === "none" ? null : providerId,
      refuel_date: String(fd.get("refuel_date")),
      fuel_type: fuelType,
      liters: Number(l.toFixed(3)),
      price_per_liter: p,
      total_amount: Number(amt.toFixed(2)),
      odometer: fd.get("odometer") ? parseInt(String(fd.get("odometer")), 10) : null,
      requisition_number: String(fd.get("requisition_number") || "") || null,
      payment_method: paymentMethod,
      credit_id: paymentMethod === "credito_antecipado" && creditId !== "none" ? creditId : null,
      notes: String(fd.get("notes") || "") || null,
      created_by: user?.id,
    } as never);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Abastecimento registrado");
    qc.invalidateQueries({ queryKey: ["abastecimentos"] });
    setOpen(false);
    setCompanyId(""); setVehicleId(""); setProviderId("none");
    setPaidAmount(""); setPrice(""); setPaymentMethod("pix"); setCreditId("none");
  };



  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" /> Novo Abastecimento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Novo Abastecimento</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setVehicleId(""); setProviderId("none"); setCreditId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Veículo</Label>
              <Select value={vehicleId} onValueChange={setVehicleId} disabled={!companyId}>
                <SelectTrigger><SelectValue placeholder={companyId ? "Selecione" : "Selecione a empresa"} /></SelectTrigger>
                <SelectContent>
                  {companyVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` — ${v.model}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prestador / Posto</Label>
              <Select value={providerId} onValueChange={(v) => { setProviderId(v); setCreditId("none"); }} disabled={!companyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem prestador —</SelectItem>
                  {companyProviders.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Combustível</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="refuel_date">Data</Label>
              <Input id="refuel_date" name="refuel_date" type="date" required defaultValue={today()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paid_amount">Valor pago (R$)</Label>
              <Input id="paid_amount" inputMode="decimal" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} required placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Preço/L</Label>
              <Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required placeholder="0,000" />
            </div>

          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== "credito_antecipado") setCreditId("none"); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="requisition_number">Nº da Requisição</Label>
              <Input id="requisition_number" name="requisition_number" maxLength={50} placeholder="Ex.: REQ-001" />
            </div>
          </div>
          {paymentMethod === "credito_antecipado" && (
            <div className="space-y-1.5">
              <Label>Crédito antecipado a consumir</Label>
              <Select value={creditId} onValueChange={setCreditId} disabled={!companyId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Selecione —</SelectItem>
                  {availableCredits.map(({ credit, balance }) => (
                    <SelectItem key={credit.id} value={credit.id}>
                      {credit.provider_name} — Saldo {brl(balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableCredits.length === 0 && companyId && (
                <p className="text-xs text-muted-foreground">Nenhum crédito disponível para esta empresa/posto.</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="odometer">Hodômetro (km)</Label>
              <Input id="odometer" name="odometer" type="number" min={0} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Input id="notes" name="notes" maxLength={500} />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
            <span>Total: <span className="font-semibold">{brl(computed.total)}</span></span>
            <span className="text-muted-foreground">Litros estimados: <span className="font-semibold text-foreground">{computed.liters.toFixed(3)}</span></span>
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
