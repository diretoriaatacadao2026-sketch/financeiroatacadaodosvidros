GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_any_role(app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_company(uuid) TO authenticated;