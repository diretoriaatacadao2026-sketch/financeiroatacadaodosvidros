
-- Add created_by / updated_by audit columns to main tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cash_accounts','cash_transactions','companies','fuel_credits',
    'fuel_providers','fuel_refuels','installer_feedbacks','installers','vehicles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL', t);
  END LOOP;
END $$;

-- Trigger function to set updated_by automatically on UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_by = auth.uid();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger function to set created_by automatically on INSERT (if not provided)
CREATE OR REPLACE FUNCTION public.set_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = auth.uid();
  END IF;
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Attach triggers
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cash_accounts','cash_transactions','companies','fuel_credits',
    'fuel_providers','fuel_refuels','installer_feedbacks','installers','vehicles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_created_by ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_set_created_by BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_created_by()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_by ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_set_updated_by BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_by()', t);
  END LOOP;
END $$;

-- Allow authenticated users to read all profiles' display names for audit attribution
-- (limited view: only id, full_name, email — already in profiles table)
DROP POLICY IF EXISTS "Authenticated can view profile names for audit" ON public.profiles;
CREATE POLICY "Authenticated can view profile names for audit"
ON public.profiles FOR SELECT
TO authenticated
USING (true);
