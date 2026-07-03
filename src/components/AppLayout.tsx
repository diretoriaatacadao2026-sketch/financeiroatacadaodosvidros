import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, LogOut, Building2, Menu, Star, Fuel, Users, FileText, GitCompareArrows } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/caixa", label: "Fechamento de Caixa", icon: Wallet, adminOnly: false },
  { to: "/conciliacao", label: "Conciliação", icon: GitCompareArrows, adminOnly: false },
  { to: "/montadores", label: "Feedback Montadores", icon: Star, adminOnly: false },
  { to: "/abastecimentos", label: "Abastecimentos", icon: Fuel, adminOnly: false },
  { to: "/relatorios", label: "Relatórios", icon: FileText, adminOnly: false },

  { to: "/usuarios", label: "Usuários", icon: Users, adminOnly: true },
] as const;


export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, roles, signOut, hasRole } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  const roleLabels = roles.map((r) => ROLE_LABEL[r]).join(" · ");
  const navItems = NAV.filter((n) => !n.adminOnly || hasRole("admin"));


  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-sidebar transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Glass ERP</div>
            <div className="text-xs text-muted-foreground">Gestão Vidraçaria</div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col md:ml-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-sm font-medium text-muted-foreground">Bem-vindo de volta</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user?.email}</div>
              <div className="text-xs text-muted-foreground">{roleLabels || "Sem perfil"}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              {initial}
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children ?? <Outlet />}</main>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
