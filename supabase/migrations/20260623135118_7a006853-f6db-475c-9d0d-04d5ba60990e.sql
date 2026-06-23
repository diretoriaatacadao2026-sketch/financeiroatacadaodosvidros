
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','ivan','financeiro','gestor','montador','vendedor');
CREATE TYPE public.payment_method AS ENUM ('pix','transferencia','dinheiro','cartao_debito','cartao_credito','boleto','cheque','credito_loja');
CREATE TYPE public.tx_type AS ENUM ('entrada','saida');

-- Companies
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read companies" ON public.companies FOR SELECT TO authenticated USING (true);

INSERT INTO public.companies (name, slug) VALUES
  ('Atacadão dos Vidros','atacadao-vidros'),
  ('Mercadão dos Vidros','mercadao-vidros'),
  ('Atacadão Pará','atacadao-para'),
  ('Vidraçaria Goiás','vidracaria-goias');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- User Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_any_role(_roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY(_roles))
$$;

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto-create profile + default role (vendedor) on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  -- Bootstrap: first user becomes admin
  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Cash accounts (one per bank per company)
CREATE TABLE public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Itaú, Sicredi, Caixa Física
  kind TEXT NOT NULL CHECK (kind IN ('itau','sicredi','caixa_fisica')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, kind)
);
GRANT SELECT ON public.cash_accounts TO authenticated;
GRANT ALL ON public.cash_accounts TO service_role;
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read accounts" ON public.cash_accounts FOR SELECT TO authenticated USING (true);

INSERT INTO public.cash_accounts (company_id, name, kind)
SELECT c.id, x.name, x.kind FROM public.companies c
CROSS JOIN (VALUES ('Itaú','itau'),('Sicredi','sicredi'),('Caixa Física','caixa_fisica')) AS x(name,kind);

-- Cash transactions
CREATE TABLE public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number BIGSERIAL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  tx_date DATE NOT NULL DEFAULT CURRENT_DATE,
  client_name TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  payment_method public.payment_method NOT NULL,
  tx_type public.tx_type NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.cash_transactions (company_id, tx_date DESC);
CREATE INDEX ON public.cash_transactions (account_id, tx_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transactions TO authenticated;
GRANT ALL ON public.cash_transactions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE cash_transactions_number_seq TO authenticated;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- All authenticated can read; admin/ivan/financeiro/gestor can write; vendedor/montador read-only
CREATE POLICY "auth read tx" ON public.cash_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance write tx" ON public.cash_transactions FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[]));
CREATE POLICY "finance update tx" ON public.cash_transactions FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[]))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','financeiro','gestor']::public.app_role[]));
CREATE POLICY "finance delete tx" ON public.cash_transactions FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','financeiro']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER tx_updated BEFORE UPDATE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
