-- Counts one AI request for a user today and says whether it's still within the daily limit.
-- A single statement, so two requests at the same moment can't both slip under the limit.
create or replace function public.use_ai_quota(p_uid text, p_limit int)
returns boolean
language sql
set search_path = ''
as $$
  insert into public.ai_usage as u (uid, day, requests)
  values (p_uid, current_date, 1)
  on conflict (uid, day) do update set requests = u.requests + 1
  returning u.requests <= p_limit;
$$;

-- Only the Edge Function (secret key, service_role) may call it
revoke execute on function public.use_ai_quota(text, int) from public, anon, authenticated;
grant execute on function public.use_ai_quota(text, int) to service_role;

-- Make the API see the new function right away
notify pgrst, 'reload schema';
