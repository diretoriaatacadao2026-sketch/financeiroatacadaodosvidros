-- Trava edição/exclusão de lançamentos (cash_transactions) quando o caixa
-- do dia (cash_closings) já estiver fechado para aquela empresa/data.
-- Reabrindo o caixa (excluindo o registro em cash_closings) libera de novo.

CREATE OR REPLACE FUNCTION public.cash_day_is_closed(_company_id uuid, _tx_date date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cash_closings
    WHERE company_id = _company_id AND closing_date = _tx_date
  );
$$;

DROP POLICY IF EXISTS "finance update tx" ON public.cash_transactions;
CREATE POLICY "finance update tx" ON public.cash_transactions FOR UPDATE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[])
    AND NOT public.cash_day_is_closed(company_id, tx_date)
  )
  WITH CHECK (
    public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[])
    AND NOT public.cash_day_is_closed(company_id, tx_date)
  );

DROP POLICY IF EXISTS "finance delete tx" ON public.cash_transactions;
CREATE POLICY "finance delete tx" ON public.cash_transactions FOR DELETE TO authenticated
  USING (
    public.current_user_has_any_role(ARRAY['admin','financeiro']::public.app_role[])
    AND NOT public.cash_day_is_closed(company_id, tx_date)
  );
