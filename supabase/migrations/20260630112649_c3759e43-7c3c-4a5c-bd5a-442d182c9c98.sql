
CREATE TABLE IF NOT EXISTS public.daily_cash_supplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supply_date date NOT NULL DEFAULT current_date,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (company_id, supply_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_cash_supplies TO authenticated;
GRANT ALL ON public.daily_cash_supplies TO service_role;

ALTER TABLE public.daily_cash_supplies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplies_select" ON public.daily_cash_supplies
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));

CREATE POLICY "supplies_insert" ON public.daily_cash_supplies
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(company_id) AND public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[]));

CREATE POLICY "supplies_update" ON public.daily_cash_supplies
  FOR UPDATE TO authenticated
  USING (public.user_can_access_company(company_id) AND public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[]))
  WITH CHECK (public.user_can_access_company(company_id));

CREATE POLICY "supplies_delete" ON public.daily_cash_supplies
  FOR DELETE TO authenticated
  USING (public.user_can_access_company(company_id) AND public.current_user_has_any_role(ARRAY['admin','financeiro']::public.app_role[]));

CREATE TRIGGER set_supplies_created_by BEFORE INSERT ON public.daily_cash_supplies
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER set_supplies_updated_by BEFORE UPDATE ON public.daily_cash_supplies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();
