
ALTER TABLE public.cash_accounts DROP CONSTRAINT IF EXISTS cash_accounts_kind_check;
ALTER TABLE public.cash_accounts ADD CONSTRAINT cash_accounts_kind_check
  CHECK (kind = ANY (ARRAY['itau','sicredi','caixa_fisica','infinity']::text[]));

ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'credito_antecipado';

ALTER TABLE public.cash_transactions ADD COLUMN IF NOT EXISTS budget_number text;

ALTER TABLE public.installers ALTER COLUMN company_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.fuel_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.fuel_providers(id) ON DELETE SET NULL,
  provider_name text NOT NULL,
  cnpj text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  paid_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_credits TO authenticated;
GRANT ALL ON public.fuel_credits TO service_role;
ALTER TABLE public.fuel_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_credits read by company members"
  ON public.fuel_credits FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));
CREATE POLICY "fuel_credits insert by managers"
  ON public.fuel_credits FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_company(company_id)
    AND public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]));
CREATE POLICY "fuel_credits update by managers"
  ON public.fuel_credits FOR UPDATE TO authenticated
  USING (public.user_can_access_company(company_id)
    AND public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]));
CREATE POLICY "fuel_credits delete by managers"
  ON public.fuel_credits FOR DELETE TO authenticated
  USING (public.user_can_access_company(company_id)
    AND public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]));

CREATE TRIGGER fuel_credits_updated_at
  BEFORE UPDATE ON public.fuel_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fuel_refuels
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS requisition_number text,
  ADD COLUMN IF NOT EXISTS credit_id uuid REFERENCES public.fuel_credits(id) ON DELETE SET NULL;

INSERT INTO public.cash_accounts (company_id, name, kind)
SELECT c.id, 'INFINITY', 'infinity'
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.cash_accounts a WHERE a.company_id = c.id AND a.name = 'INFINITY'
);
