-- REQ-13 (Security 4/9): public.handle_new_user() is a security definer
-- trigger function (0001_sat_accounts.sql). Supabase's default privileges in
-- schema public granted EXECUTE to anon and authenticated, exposing it at
-- /rest/v1/rpc. Revoke from the API roles by name, since `from public` alone
-- does not remove those explicit grants. The on_auth_user_created trigger keeps
-- firing: EXECUTE is checked at CREATE TRIGGER, not when the trigger fires.
revoke all on function public.handle_new_user() from public, anon, authenticated;
