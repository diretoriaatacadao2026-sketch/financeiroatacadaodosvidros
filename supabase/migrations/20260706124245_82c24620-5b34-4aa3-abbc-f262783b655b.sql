
-- 1. bank_statements & bank_statement_items: remove NULL company_id bypass
DROP POLICY IF EXISTS bs_select ON public.bank_statements;
DROP POLICY IF EXISTS bs_insert ON public.bank_statements;
DROP POLICY IF EXISTS bs_update ON public.bank_statements;
DROP POLICY IF EXISTS bs_delete ON public.bank_statements;

CREATE POLICY bs_select ON public.bank_statements FOR SELECT
  USING (company_id IS NOT NULL AND public.user_can_access_company(company_id));
CREATE POLICY bs_insert ON public.bank_statements FOR INSERT
  WITH CHECK (company_id IS NOT NULL AND public.user_can_access_company(company_id));
CREATE POLICY bs_update ON public.bank_statements FOR UPDATE
  USING (company_id IS NOT NULL AND public.user_can_access_company(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.user_can_access_company(company_id));
CREATE POLICY bs_delete ON public.bank_statements FOR DELETE
  USING (company_id IS NOT NULL AND public.user_can_access_company(company_id));

DROP POLICY IF EXISTS bsi_select ON public.bank_statement_items;
DROP POLICY IF EXISTS bsi_insert ON public.bank_statement_items;
DROP POLICY IF EXISTS bsi_update ON public.bank_statement_items;
DROP POLICY IF EXISTS bsi_delete ON public.bank_statement_items;

CREATE POLICY bsi_select ON public.bank_statement_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.bank_statements s
    WHERE s.id = bank_statement_items.statement_id
      AND s.company_id IS NOT NULL
      AND public.user_can_access_company(s.company_id)));
CREATE POLICY bsi_insert ON public.bank_statement_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.bank_statements s
    WHERE s.id = bank_statement_items.statement_id
      AND s.company_id IS NOT NULL
      AND public.user_can_access_company(s.company_id)));
CREATE POLICY bsi_update ON public.bank_statement_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.bank_statements s
    WHERE s.id = bank_statement_items.statement_id
      AND s.company_id IS NOT NULL
      AND public.user_can_access_company(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bank_statements s
    WHERE s.id = bank_statement_items.statement_id
      AND s.company_id IS NOT NULL
      AND public.user_can_access_company(s.company_id)));
CREATE POLICY bsi_delete ON public.bank_statement_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.bank_statements s
    WHERE s.id = bank_statement_items.statement_id
      AND s.company_id IS NOT NULL
      AND public.user_can_access_company(s.company_id)));

-- 2. Recreate view as SECURITY INVOKER
DROP VIEW IF EXISTS public.user_display_names;
CREATE VIEW public.user_display_names
  WITH (security_invoker = true)
  AS SELECT id, full_name FROM public.profiles;
GRANT SELECT ON public.user_display_names TO authenticated;

-- 3. Restrict handle_new_user (trigger-only) from being called by API roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Explicit INSERT policy on profiles: users can only insert their own row.
-- (Actual profile creation happens via the SECURITY DEFINER trigger handle_new_user.)
DROP POLICY IF EXISTS "insert own profile" ON public.profiles;
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
