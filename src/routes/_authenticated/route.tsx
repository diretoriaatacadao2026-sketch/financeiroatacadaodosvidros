import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Clock, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Protected,
});

function Protected() {
  const { session, loading, status, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [session, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }
  if (!session) return null;

  if (status === "pending" || status === "rejected") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-accent/40 to-background p-4">
        <Card className="max-w-md p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">
            {status === "pending" ? "Aguardando aprovação" : "Acesso negado"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "pending"
              ? "Seu cadastro está aguardando a aprovação de um administrador. Você receberá acesso assim que ele atribuir seu tipo de usuário."
              : "Seu cadastro foi rejeitado pelo administrador. Entre em contato com o responsável para mais informações."}
          </p>
          <Button variant="outline" className="mt-6" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
