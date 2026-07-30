-- "Caixa" de crédito antecipado de combustível:
-- Quando o saldo de um fuel_credits chegar a zero (soma dos fuel_refuels
-- vinculados == valor do crédito), o crédito é fechado automaticamente
-- (closed_at = now()). Um crédito fechado some da lista de créditos
-- disponíveis para novos abastecimentos, mas continua consultável pelo
-- histórico (closed_at preenchido = "caixa fechado").
-- Se um abastecimento vinculado for excluído/alterado e o saldo voltar a
-- ficar positivo, o crédito é reaberto automaticamente (closed_at = null).

ALTER TABLE public.fuel_credits
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE OR REPLACE FUNCTION public.recalc_fuel_credit_closed(_credit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amount numeric(14,2);
  _used numeric(14,2);
  _closed_at timestamptz;
  _balance numeric(14,2);
BEGIN
  IF _credit_id IS NULL THEN
    RETURN;
  END IF;

  SELECT amount, closed_at INTO _amount, _closed_at
  FROM public.fuel_credits
  WHERE id = _credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(total_amount), 0) INTO _used
  FROM public.fuel_refuels
  WHERE credit_id = _credit_id;

  _balance := _amount - _used;

  IF _balance <= 0.001 AND _closed_at IS NULL THEN
    UPDATE public.fuel_credits SET closed_at = now() WHERE id = _credit_id;
  ELSIF _balance > 0.001 AND _closed_at IS NOT NULL THEN
    UPDATE public.fuel_credits SET closed_at = NULL WHERE id = _credit_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fuel_refuels_recalc_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_fuel_credit_closed(OLD.credit_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_fuel_credit_closed(NEW.credit_id);
  IF TG_OP = 'UPDATE' AND OLD.credit_id IS DISTINCT FROM NEW.credit_id THEN
    PERFORM public.recalc_fuel_credit_closed(OLD.credit_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fuel_refuels_recalc_credit ON public.fuel_refuels;
CREATE TRIGGER trg_fuel_refuels_recalc_credit
  AFTER INSERT OR UPDATE OF total_amount, credit_id OR DELETE ON public.fuel_refuels
  FOR EACH ROW EXECUTE FUNCTION public.fuel_refuels_recalc_credit();

-- Impede lançar um novo abastecimento consumindo um crédito já fechado
-- ("caixa" zerado/encerrado).
CREATE OR REPLACE FUNCTION public.fuel_refuels_block_closed_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _closed_at timestamptz;
BEGIN
  IF NEW.credit_id IS NOT NULL THEN
    SELECT closed_at INTO _closed_at FROM public.fuel_credits WHERE id = NEW.credit_id;
    IF _closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Este crédito antecipado já está fechado (saldo zerado).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fuel_refuels_block_closed_credit ON public.fuel_refuels;
CREATE TRIGGER trg_fuel_refuels_block_closed_credit
  BEFORE INSERT OR UPDATE OF credit_id ON public.fuel_refuels
  FOR EACH ROW EXECUTE FUNCTION public.fuel_refuels_block_closed_credit();

-- Recalcula créditos já existentes (idempotente, cobre dados atuais).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.fuel_credits LOOP
    PERFORM public.recalc_fuel_credit_closed(r.id);
  END LOOP;
END $$;
