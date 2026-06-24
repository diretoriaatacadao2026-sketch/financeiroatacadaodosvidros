
DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.profile_status NOT NULL DEFAULT 'pending';

UPDATE public.profiles SET status = 'approved' WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
BEGIN
  is_first := (SELECT count(*) FROM public.user_roles) = 0;
  INSERT INTO public.profiles (id, full_name, email, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    CASE WHEN is_first THEN 'approved'::public.profile_status ELSE 'pending'::public.profile_status END
  );
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.user_can_access_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ivan')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'colaborador')
    OR EXISTS (
      SELECT 1 FROM public.user_companies
      WHERE user_id = auth.uid() AND company_id = _company_id
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_can_access_company(uuid) TO authenticated;

DROP POLICY IF EXISTS "admins update profiles" ON public.profiles;
CREATE POLICY "admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
