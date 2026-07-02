
CREATE TABLE public.cash_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  closing_date date NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (company_id, closing_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_closings TO authenticated;
GRANT ALL ON public.cash_closings TO service_role;

ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closings_select" ON public.cash_closings
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));

CREATE POLICY "closings_insert" ON public.cash_closings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_can_access_company(company_id)
    AND public.current_user_has_any_role(ARRAY['admin'::app_role,'financeiro'::app_role,'gestor'::app_role])
  );

CREATE POLICY "closings_update" ON public.cash_closings
  FOR UPDATE TO authenticated
  USING (
    public.user_can_access_company(company_id)
    AND public.current_user_has_any_role(ARRAY['admin'::app_role,'financeiro'::app_role,'gestor'::app_role])
  )
  WITH CHECK (public.user_can_access_company(company_id));

CREATE POLICY "closings_delete" ON public.cash_closings
  FOR DELETE TO authenticated
  USING (
    public.user_can_access_company(company_id)
    AND public.current_user_has_any_role(ARRAY['admin'::app_role,'financeiro'::app_role])
  );

CREATE TRIGGER set_closings_created_by BEFORE INSERT ON public.cash_closings
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();

CREATE TRIGGER set_closings_updated_by BEFORE UPDATE ON public.cash_closings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

CREATE INDEX cash_closings_date_idx ON public.cash_closings (closing_date DESC);
