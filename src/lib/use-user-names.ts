import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserNameMap = Record<string, string>;

let cache: UserNameMap | null = null;
let inflight: Promise<UserNameMap> | null = null;

async function loadUserNames(): Promise<UserNameMap> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, email");
    const map: UserNameMap = {};
    (data ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
      map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
    });
    cache = map;
    return map;
  })();
  return inflight;
}

export function useUserNames() {
  const [names, setNames] = useState<UserNameMap>(cache ?? {});
  useEffect(() => {
    loadUserNames().then(setNames);
  }, []);
  const display = (id?: string | null) => (id ? names[id] ?? "—" : "—");
  return { names, display };
}
