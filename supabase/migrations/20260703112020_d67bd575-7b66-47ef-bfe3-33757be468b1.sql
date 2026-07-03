-- Add reconciliation fields to cash_transactions
ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS reconciled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_reconciled ON public.cash_transactions(reconciled, tx_date);

-- Bank statement uploads (one per PDF upload)
CREATE TABLE IF NOT EXISTS public.bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  statement_date DATE NOT NULL,
  file_name TEXT NOT NULL,
  bank_hint TEXT,
  total_credits NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_debits NUMERIC(14,2) NOT NULL DEFAULT 0,
  items_count INT NOT NULL DEFAULT 0,
  raw_text TEXT,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements TO authenticated;
GRANT ALL ON public.bank_statements TO service_role;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bs_select" ON public.bank_statements FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.user_can_access_company(company_id));
CREATE POLICY "bs_insert" ON public.bank_statements FOR INSERT TO authenticated
  WITH CHECK (company_id IS NULL OR public.user_can_access_company(company_id));
CREATE POLICY "bs_update" ON public.bank_statements FOR UPDATE TO authenticated
  USING (company_id IS NULL OR public.user_can_access_company(company_id));
CREATE POLICY "bs_delete" ON public.bank_statements FOR DELETE TO authenticated
  USING (company_id IS NULL OR public.user_can_access_company(company_id));

CREATE TRIGGER trg_bs_created_by BEFORE INSERT ON public.bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_created_by();
CREATE TRIGGER trg_bs_updated_by BEFORE UPDATE ON public.bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_by();

-- Parsed line items from statement PDF
CREATE TABLE IF NOT EXISTS public.bank_statement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  item_date DATE NOT NULL,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  matched_tx_id UUID REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
  match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('matched','unmatched','divergent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_items TO authenticated;
GRANT ALL ON public.bank_statement_items TO service_role;
ALTER TABLE public.bank_statement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bsi_select" ON public.bank_statement_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bank_statements s WHERE s.id = statement_id
    AND (s.company_id IS NULL OR public.user_can_access_company(s.company_id))));
CREATE POLICY "bsi_insert" ON public.bank_statement_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.bank_statements s WHERE s.id = statement_id
    AND (s.company_id IS NULL OR public.user_can_access_company(s.company_id))));
CREATE POLICY "bsi_update" ON public.bank_statement_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bank_statements s WHERE s.id = statement_id
    AND (s.company_id IS NULL OR public.user_can_access_company(s.company_id))));
CREATE POLICY "bsi_delete" ON public.bank_statement_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bank_statements s WHERE s.id = statement_id
    AND (s.company_id IS NULL OR public.user_can_access_company(s.company_id))));

CREATE INDEX IF NOT EXISTS idx_bsi_statement ON public.bank_statement_items(statement_id);
CREATE INDEX IF NOT EXISTS idx_bsi_date_amount ON public.bank_statement_items(item_date, amount);