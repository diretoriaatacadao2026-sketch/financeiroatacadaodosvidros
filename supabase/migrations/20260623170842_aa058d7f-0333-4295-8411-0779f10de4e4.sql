
-- 1. Membership table
CREATE TABLE IF NOT EXISTS public.user_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id)
);

GRANT SELECT ON public.user_companies TO authenticated;
GRANT ALL ON public.user_companies TO service_role;

ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own memberships" ON public.user_companies
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage memberships" ON public.user_companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Company-access helper (admin/ivan see all; others by membership)
CREATE OR REPLACE FUNCTION public.user_can_access_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ivan')
    OR EXISTS (
      SELECT 1 FROM public.user_companies
      WHERE user_id = auth.uid() AND company_id = _company_id
    )
$$;

-- 3. Backfill admins into all companies
INSERT INTO public.user_companies (user_id, company_id)
SELECT ur.user_id, c.id
FROM public.user_roles ur
CROSS JOIN public.companies c
WHERE ur.role = 'admin'
ON CONFLICT (user_id, company_id) DO NOTHING;

-- 4. Tighten profiles SELECT
DROP POLICY IF EXISTS "read all profiles" ON public.profiles;
CREATE POLICY "read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- 5. Company scoping on companies
DROP POLICY IF EXISTS "auth read companies" ON public.companies;
CREATE POLICY "read accessible companies" ON public.companies
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(id));

-- 6. cash_accounts
DROP POLICY IF EXISTS "auth read accounts" ON public.cash_accounts;
CREATE POLICY "read company accounts" ON public.cash_accounts
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));

-- 7. cash_transactions
DROP POLICY IF EXISTS "auth read tx" ON public.cash_transactions;
DROP POLICY IF EXISTS "finance write tx" ON public.cash_transactions;
DROP POLICY IF EXISTS "finance update tx" ON public.cash_transactions;
DROP POLICY IF EXISTS "finance delete tx" ON public.cash_transactions;

CREATE POLICY "read company tx" ON public.cash_transactions
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));

CREATE POLICY "finance write tx" ON public.cash_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  );

CREATE POLICY "finance update tx" ON public.cash_transactions
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  );

CREATE POLICY "finance delete tx" ON public.cash_transactions
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','financeiro']::app_role[])
    AND public.user_can_access_company(company_id)
  );

-- 8. installers
DROP POLICY IF EXISTS "auth read installers" ON public.installers;
DROP POLICY IF EXISTS "mgr write installers" ON public.installers;
DROP POLICY IF EXISTS "mgr update installers" ON public.installers;
DROP POLICY IF EXISTS "mgr delete installers" ON public.installers;

CREATE POLICY "read company installers" ON public.installers
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));

CREATE POLICY "mgr write installers" ON public.installers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[])
    AND public.user_can_access_company(company_id)
  );

CREATE POLICY "mgr update installers" ON public.installers
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[])
    AND public.user_can_access_company(company_id)
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[])
    AND public.user_can_access_company(company_id)
  );

CREATE POLICY "mgr delete installers" ON public.installers
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  );

-- 9. installer_feedbacks
DROP POLICY IF EXISTS "auth read feedbacks" ON public.installer_feedbacks;
DROP POLICY IF EXISTS "write feedbacks" ON public.installer_feedbacks;
DROP POLICY IF EXISTS "update feedbacks" ON public.installer_feedbacks;
DROP POLICY IF EXISTS "delete feedbacks" ON public.installer_feedbacks;

CREATE POLICY "read company feedbacks" ON public.installer_feedbacks
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));

CREATE POLICY "write feedbacks" ON public.installer_feedbacks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','gestor','financeiro','vendedor']::app_role[])
    AND public.user_can_access_company(company_id)
  );

CREATE POLICY "update feedbacks" ON public.installer_feedbacks
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  );

CREATE POLICY "delete feedbacks" ON public.installer_feedbacks
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','gestor']::app_role[])
    AND public.user_can_access_company(company_id)
  );

-- 10. Revoke EXECUTE on SECURITY DEFINER functions from public/authenticated.
-- They remain usable inside RLS policy expressions (evaluated as table owner).
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_has_any_role(app_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_can_access_company(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
