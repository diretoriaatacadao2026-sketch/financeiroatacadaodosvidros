
ALTER TABLE public.cash_accounts DROP CONSTRAINT cash_accounts_kind_check;
ALTER TABLE public.cash_accounts ADD CONSTRAINT cash_accounts_kind_check
  CHECK (kind = ANY (ARRAY['itau','sicredi','caixa_fisica','infinity','caixa_2']));
