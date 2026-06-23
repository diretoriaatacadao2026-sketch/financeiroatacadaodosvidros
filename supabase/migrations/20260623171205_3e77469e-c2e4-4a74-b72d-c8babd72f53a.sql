
-- vehicles
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plate text NOT NULL,
  model text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vehicles_company ON public.vehicles(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read company vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));
CREATE POLICY "mgr write vehicles" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id));
CREATE POLICY "mgr update vehicles" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id));
CREATE POLICY "mgr delete vehicles" ON public.vehicles
  FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor']::app_role[]) AND public.user_can_access_company(company_id));

CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fuel_providers
CREATE TABLE public.fuel_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fuel_providers_company ON public.fuel_providers(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_providers TO authenticated;
GRANT ALL ON public.fuel_providers TO service_role;
ALTER TABLE public.fuel_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read company providers" ON public.fuel_providers
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));
CREATE POLICY "mgr write providers" ON public.fuel_providers
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id));
CREATE POLICY "mgr update providers" ON public.fuel_providers
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id));
CREATE POLICY "mgr delete providers" ON public.fuel_providers
  FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor']::app_role[]) AND public.user_can_access_company(company_id));

CREATE TRIGGER trg_fuel_providers_updated BEFORE UPDATE ON public.fuel_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- fuel_refuels
CREATE TABLE public.fuel_refuels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES public.fuel_providers(id) ON DELETE SET NULL,
  refuel_date date NOT NULL DEFAULT CURRENT_DATE,
  fuel_type text NOT NULL DEFAULT 'diesel',
  liters numeric(10,2) NOT NULL CHECK (liters > 0),
  price_per_liter numeric(10,3) NOT NULL CHECK (price_per_liter >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  odometer integer,
  driver_name text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fuel_refuels_company ON public.fuel_refuels(company_id);
CREATE INDEX idx_fuel_refuels_vehicle ON public.fuel_refuels(vehicle_id);
CREATE INDEX idx_fuel_refuels_provider ON public.fuel_refuels(provider_id);
CREATE INDEX idx_fuel_refuels_date ON public.fuel_refuels(refuel_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fuel_refuels TO authenticated;
GRANT ALL ON public.fuel_refuels TO service_role;
ALTER TABLE public.fuel_refuels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read company refuels" ON public.fuel_refuels
  FOR SELECT TO authenticated
  USING (public.user_can_access_company(company_id));
CREATE POLICY "write refuels" ON public.fuel_refuels
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro','vendedor']::app_role[]) AND public.user_can_access_company(company_id));
CREATE POLICY "update refuels" ON public.fuel_refuels
  FOR UPDATE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id))
  WITH CHECK (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id));
CREATE POLICY "delete refuels" ON public.fuel_refuels
  FOR DELETE TO authenticated
  USING (public.current_user_has_any_role(ARRAY['admin','gestor','financeiro']::app_role[]) AND public.user_can_access_company(company_id));

CREATE TRIGGER trg_fuel_refuels_updated BEFORE UPDATE ON public.fuel_refuels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
