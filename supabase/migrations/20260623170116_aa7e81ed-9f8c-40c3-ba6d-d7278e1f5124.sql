
CREATE TABLE public.installers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installers TO authenticated;
GRANT ALL ON public.installers TO service_role;
ALTER TABLE public.installers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read installers" ON public.installers FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgr write installers" ON public.installers FOR INSERT TO authenticated
  WITH CHECK (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role,'financeiro'::app_role]));
CREATE POLICY "mgr update installers" ON public.installers FOR UPDATE TO authenticated
  USING (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role,'financeiro'::app_role]))
  WITH CHECK (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role,'financeiro'::app_role]));
CREATE POLICY "mgr delete installers" ON public.installers FOR DELETE TO authenticated
  USING (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role]));

CREATE TABLE public.installer_feedbacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  installer_id UUID NOT NULL REFERENCES public.installers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installer_feedbacks TO authenticated;
GRANT ALL ON public.installer_feedbacks TO service_role;
ALTER TABLE public.installer_feedbacks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read feedbacks" ON public.installer_feedbacks FOR SELECT TO authenticated USING (true);
CREATE POLICY "write feedbacks" ON public.installer_feedbacks FOR INSERT TO authenticated
  WITH CHECK (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role,'financeiro'::app_role,'vendedor'::app_role]));
CREATE POLICY "update feedbacks" ON public.installer_feedbacks FOR UPDATE TO authenticated
  USING (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role]))
  WITH CHECK (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role]));
CREATE POLICY "delete feedbacks" ON public.installer_feedbacks FOR DELETE TO authenticated
  USING (current_user_has_any_role(ARRAY['admin'::app_role,'gestor'::app_role]));

CREATE TRIGGER trg_installers_updated BEFORE UPDATE ON public.installers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_feedbacks_updated BEFORE UPDATE ON public.installer_feedbacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_feedbacks_installer ON public.installer_feedbacks(installer_id);
CREATE INDEX idx_feedbacks_company ON public.installer_feedbacks(company_id);
CREATE INDEX idx_installers_company ON public.installers(company_id);
