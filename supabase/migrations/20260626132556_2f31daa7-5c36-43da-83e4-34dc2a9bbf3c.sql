
-- 1) profiles: drop broad audit policy; add safe view for display names
DROP POLICY IF EXISTS "Authenticated can view profile names for audit" ON public.profiles;

CREATE OR REPLACE VIEW public.user_display_names
WITH (security_invoker = false) AS
SELECT id, full_name FROM public.profiles;

GRANT SELECT ON public.user_display_names TO authenticated;

-- 2) user_can_access_company: only admin bypasses; everyone else must be a member
CREATE OR REPLACE FUNCTION public.user_can_access_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_companies
      WHERE user_id = auth.uid() AND company_id = _company_id
    )
$$;

-- Backfill: link all non-admin existing users to all current companies
INSERT INTO public.user_companies (user_id, company_id)
SELECT p.id, c.id
FROM public.profiles p
CROSS JOIN public.companies c
WHERE NOT public.has_role(p.id, 'admin')
ON CONFLICT DO NOTHING;

-- 3) Revoke EXECUTE from authenticated/public on SECURITY DEFINER functions
-- that are never called directly from app code (only via triggers/auth hooks).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_by() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.set_created_by() FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, authenticated, anon;
