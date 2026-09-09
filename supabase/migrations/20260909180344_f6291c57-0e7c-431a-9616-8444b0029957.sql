ALTER TABLE public.fuel_credits
  ADD COLUMN IF NOT EXISTS carry_from_credit_id uuid REFERENCES public.fuel_credits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carry_amount numeric(14,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS fuel_credits_carry_from_unique
  ON public.fuel_credits (carry_from_credit_id)
  WHERE carry_from_credit_id IS NOT NULL;