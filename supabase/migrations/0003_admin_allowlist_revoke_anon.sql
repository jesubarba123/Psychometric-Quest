-- E2 (review) — La función se autoprotege (auth.uid() + allowlist), pero anon
-- jamás tiene sesión: revocar EXECUTE elimina superficie y silencia el linter
-- 0028 de Supabase. Aplicada en prod el 2026-07-02 vía MCP.
revoke execute on function public.ensure_admin_org(text) from anon;
