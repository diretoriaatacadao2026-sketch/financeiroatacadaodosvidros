DROP TRIGGER IF EXISTS trg_fuel_refuels_recalc_credit ON public.fuel_refuels;
DROP FUNCTION IF EXISTS public.fuel_refuels_recalc_credit();
DROP FUNCTION IF EXISTS public.recalc_fuel_credit_closed(uuid);

DELETE FROM public.fuel_refuels WHERE id IS NOT NULL;
DELETE FROM public.fuel_credits WHERE id IS NOT NULL;