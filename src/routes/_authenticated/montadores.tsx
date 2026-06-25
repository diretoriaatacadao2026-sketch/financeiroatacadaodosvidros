import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { dateBR } from "@/lib/format";
import { useUserNames } from "@/lib/use-user-names";
import { Plus, Star, Trash2, Trophy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/montadores")({
  ssr: false,
  head: () => ({ meta: [{ title: "Feedback dos Montadores — Glass ERP" }] }),
  component: () => (
    <Suspense fallback={<div className="text-muted-foreground">Carregando...</div>}>
      <MontadoresPage />
    </Suspense>
  ),
});

interface Company { id: string; name: string }
interface Installer { id: string; name: string; phone: string | null; active: boolean; company_id: string | null }
interface Feedback {
  id: string; installer_id: string; company_id: string;
  client_name: string | null; rating: number; comment: string | null; service_date: string;
}

const dataQuery = (companyId: string | "all") => queryOptions({
  queryKey: ["montadores", companyId],
  queryFn: async () => {
    const [{ data: companies }, instRes, fbRes] = await Promise.all([
      supabase.from("companies").select("id, name").order("name"),
      supabase.from("installers").select("id, name, phone, active, company_id").order("name"),
      companyId === "all"
        ? supabase.from("installer_feedbacks").select("id, installer_id, company_id, client_name, rating, comment, service_date").order("service_date", { ascending: false }).limit(500)
        : supabase.from("installer_feedbacks").select("id, installer_id, company_id, client_name, rating, comment, service_date").eq("company_id", companyId).order("service_date", { ascending: false }).limit(500),
    ]);
    if (instRes.error) throw instRes.error;
    if (fbRes.error) throw fbRes.error;
    return {
      companies: (companies ?? []) as Company[],
      installers: (instRes.data ?? []) as Installer[],
      feedbacks: (fbRes.data ?? []) as Feedback[],
    };
  },
});

function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn("transition", onChange && "hover:scale-110 cursor-pointer", !onChange && "cursor-default")}
        >
          <Star
            style={{ width: size, height: size }}
            className={cn(n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
          />
        </button>
      ))}
    </div>
  );
}

function MontadoresPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole(["admin", "gestor", "financeiro"]);
  const canFeedback = hasRole(["admin", "gestor", "financeiro", "vendedor"]);
  const canDelete = hasRole(["admin", "gestor"]);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const { data } = useSuspenseQuery(dataQuery(companyFilter));
  const qc = useQueryClient();

  const ranking = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    data.feedbacks.forEach((f) => {
      const cur = map.get(f.installer_id) ?? { sum: 0, count: 0 };
      cur.sum += f.rating;
      cur.count += 1;
      map.set(f.installer_id, cur);
    });
    return data.installers
      .map((i) => {
        const s = map.get(i.id);
        return {
          installer: i,
          avg: s ? s.sum / s.count : 0,
          count: s?.count ?? 0,
        };
      })
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [data]);

  const overall = useMemo(() => {
    if (data.feedbacks.length === 0) return 0;
    return data.feedbacks.reduce((s, f) => s + f.rating, 0) / data.feedbacks.length;
  }, [data.feedbacks]);

  const deleteFeedback = async (id: string) => {
    if (!confirm("Excluir esta avaliação?")) return;
    const { error } = await supabase.from("installer_feedbacks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Avaliação excluída");
    qc.invalidateQueries({ queryKey: ["montadores"] });
  };

  const deleteInstaller = async (id: string) => {
    if (!confirm("Excluir este montador? Todas as avaliações dele serão removidas.")) return;
    const { error } = await supabase.from("installers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Montador excluído");
    qc.invalidateQueries({ queryKey: ["montadores"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feedback dos Montadores</h1>
          <p className="text-sm text-muted-foreground">Avaliações, média geral e ranking por montador.</p>
        </div>
        <div className="flex gap-2">
          {canManage && <NewInstallerDialog />}
          {canFeedback && data.installers.length > 0 && (
            <NewFeedbackDialog installers={data.installers} companies={data.companies} />
          )}
        </div>
      </div>

      <Tabs value={companyFilter} onValueChange={setCompanyFilter}>
        <TabsList>
          <TabsTrigger value="all">Todas empresas</TabsTrigger>
          {data.companies.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>{c.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Média geral</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-bold">{overall.toFixed(2)}</span>
            <Stars value={Math.round(overall)} />
          </div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Avaliações</div>
          <div className="mt-2 text-2xl font-bold">{data.feedbacks.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted-foreground">Montadores ativos</div>
          <div className="mt-2 text-2xl font-bold">{data.installers.filter((i) => i.active).length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b p-4">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h3 className="font-semibold">Ranking</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Montador</TableHead>
                <TableHead>Média</TableHead>
                <TableHead className="text-right">Avaliações</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum montador cadastrado.</TableCell></TableRow>
              )}
              {ranking.map((r, idx) => {
                return (
                  <TableRow key={r.installer.id}>
                    <TableCell>
                      <Badge variant={idx < 3 ? "default" : "secondary"} className="font-normal">{idx + 1}º</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.installer.name}
                      {!r.installer.active && <Badge variant="outline" className="ml-2 text-xs">inativo</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Stars value={Math.round(r.avg)} />
                        <span className="text-sm text-muted-foreground">{r.avg ? r.avg.toFixed(2) : "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.count}</TableCell>
                    <TableCell>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => deleteInstaller(r.installer.id)}>
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

      <Card className="overflow-hidden">
        <div className="border-b p-4">
          <h3 className="font-semibold">Avaliações recentes</h3>
          <p className="text-xs text-muted-foreground">{data.feedbacks.length} registros</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Montador</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.feedbacks.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma avaliação ainda.</TableCell></TableRow>
              )}
              {data.feedbacks.map((f) => {
                const inst = data.installers.find((i) => i.id === f.installer_id);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="text-sm">{dateBR(f.service_date)}</TableCell>
                    <TableCell className="text-sm font-medium">{inst?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{f.client_name ?? "—"}</TableCell>
                    <TableCell><Stars value={f.rating} /></TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">{f.comment ?? "—"}</TableCell>
                    <TableCell>
                      {canDelete && (
                        <Button variant="ghost" size="icon" onClick={() => deleteFeedback(f.id)}>
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

function NewInstallerDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("installers").insert({
      company_id: null,
      name: String(fd.get("name")),
      phone: String(fd.get("phone") || "") || null,
    } as never);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Montador cadastrado");
    qc.invalidateQueries({ queryKey: ["montadores"] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><UserPlus className="mr-1 h-4 w-4" /> Novo Montador</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo Montador</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefone (opcional)</Label>
            <Input id="phone" name="phone" maxLength={30} />
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

function NewFeedbackDialog({ installers, companies }: { installers: Installer[]; companies: Company[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [installerId, setInstallerId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!installerId) return toast.error("Selecione o montador");
    if (!companyId) return toast.error("Selecione a empresa");
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("installer_feedbacks").insert({
      installer_id: installerId,
      company_id: companyId,
      client_name: String(fd.get("client_name") || "") || null,
      rating,
      comment: String(fd.get("comment") || "") || null,
      service_date: String(fd.get("service_date")),
      created_by: user?.id,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Avaliação registrada");
    qc.invalidateQueries({ queryKey: ["montadores"] });
    setOpen(false);
    setRating(5);
    setInstallerId("");
    setCompanyId("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" /> Nova Avaliação</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova Avaliação</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Montador</Label>
              <Select value={installerId} onValueChange={setInstallerId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {installers.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="service_date">Data do serviço</Label>
              <Input id="service_date" name="service_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_name">Cliente (opcional)</Label>
              <Input id="client_name" name="client_name" maxLength={100} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nota</Label>
            <div className="flex items-center gap-3">
              <Stars value={rating} size={28} onChange={setRating} />
              <span className="text-sm text-muted-foreground">{rating} de 5</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comment">Comentário (opcional)</Label>
            <Textarea id="comment" name="comment" maxLength={1000} rows={3} />
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
