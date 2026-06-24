import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

export type AppRole =
  | "admin"
  | "ivan"
  | "financeiro"
  | "colaborador"
  | "gestor"
  | "montador"
  | "vendedor";

export type ProfileStatus = "pending" | "approved" | "rejected";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  status: ProfileStatus | null;
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (r: AppRole | AppRole[]) => boolean;
  canWrite: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();
  const router = useRouter();

  const loadUserData = async (uid: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("status").eq("id", uid).maybeSingle(),
    ]);
    setRoles((rolesRes.data ?? []).map((r) => r.role as AppRole));
    setStatus(((profileRes.data as { status?: ProfileStatus } | null)?.status ?? null) as ProfileStatus | null);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadUserData(data.session.user.id);
      }
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (!mounted) return;
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      setSession(sess);
      if (sess?.user) {
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        setRoles([]);
        setStatus(null);
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") qc.invalidateQueries();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [qc, router]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const hasRole = (r: AppRole | AppRole[]) => {
    const arr = Array.isArray(r) ? r : [r];
    return arr.some((x) => roles.includes(x));
  };

  const canWrite = hasRole(["admin", "financeiro", "ivan", "gestor", "vendedor"]);

  const refresh = async () => {
    if (session?.user) await loadUserData(session.user.id);
  };

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        roles,
        status,
        loading,
        signOut,
        hasRole,
        canWrite,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
