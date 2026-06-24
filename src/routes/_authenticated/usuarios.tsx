import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { ASSIGNABLE_ROLES, PROFILE_STATUS_LABEL, ROLE_LABEL, dateBR } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Glass ERP" }] }),
  component: UsersPage,
});

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: "pending" | "approved" | "rejected";
  created_at?: string;
};

function UsersPage() {
  const { hasRole, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pendingRole, setPendingRole] = useState<Record<string, AppRole>>({});

  useEffect(() => {
    if (!loading && !hasRole("admin")) navigate({ to: "/dashboard", replace: true });
  }, [hasRole, loading, navigate]);

  const profilesQ = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    enabled: hasRole("admin"),
  });

  const rolesQ = useQuery({
    queryKey: ["admin", "user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
    enabled: hasRole("admin"),
  });

  const rolesByUser = useMemo(() => {
    const m: Record<string, AppRole[]> = {};
    (rolesQ.data ?? []).forEach((r: { user_id: string; role: string }) => {
      m[r.user_id] = [...(m[r.user_id] ?? []), r.role as AppRole];
    });
    return m;
  }, [rolesQ.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    qc.invalidateQueries({ queryKey: ["admin", "user_roles"] });
  };

  const approveWithRole = async (userId: string) => {
    const role = pendingRole[userId];
    if (!role) {
      toast.error("Selecione o tipo de usuário antes de aprovar.");
      return;
    }
    // Remove any existing roles, then insert the selected role
    const del = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (del.error) return toast.error(del.error.message);
    const ins = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (ins.error) return toast.error(ins.error.message);
    const upd = await supabase
      .from("profiles")
      .update({ status: "approved" })
      .eq("id", userId);
    if (upd.error) return toast.error(upd.error.message);
    toast.success("Usuário aprovado.");
    refresh();
  };

  const reject = async (userId: string) => {
    const upd = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", userId);
    if (upd.error) return toast.error(upd.error.message);
    await supabase.from("user_roles").delete().eq("user_id", userId);
    toast.success("Usuário rejeitado.");
    refresh();
  };

  const changeRole = async (userId: string, role: AppRole) => {
    const del = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (del.error) return toast.error(del.error.message);
    const ins = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (ins.error) return toast.error(ins.error.message);
    toast.success("Tipo de usuário atualizado.");
    refresh();
  };

  if (!hasRole("admin")) return null;

  const profiles = profilesQ.data ?? [];
  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <UsersIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Aprove novos cadastros e gerencie os tipos de acesso.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Pendentes de aprovação</h2>
          <Badge variant="secondary">{pending.length}</Badge>
        </div>
        {pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum usuário aguardando aprovação.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Cadastro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>{p.created_at ? dateBR(p.created_at) : "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={pendingRole[p.id] ?? ""}
                      onValueChange={(v) =>
                        setPendingRole((s) => ({ ...s, [p.id]: v as AppRole }))
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Selecionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => approveWithRole(p.id)}>
                        <Check className="mr-1 h-4 w-4" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(p.id)}>
                        <X className="mr-1 h-4 w-4" /> Rejeitar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Usuários do sistema</h2>
          <Badge variant="secondary">{others.length}</Badge>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tipo atual</TableHead>
              <TableHead className="text-right">Alterar tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {others.map((p) => {
              const currentRoles = rolesByUser[p.id] ?? [];
              const primary = currentRoles[0];
              const isSelf = p.id === user?.id;
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                  <TableCell>{p.email}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "approved" ? "default" : "destructive"}>
                      {PROFILE_STATUS_LABEL[p.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {currentRoles.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {currentRoles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sem tipo</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Select
                      value={primary ?? ""}
                      onValueChange={(v) => changeRole(p.id, v as AppRole)}
                      disabled={isSelf}
                    >
                      <SelectTrigger className="ml-auto w-44">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
