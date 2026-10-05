begin;
create view public.personal_records with (security_invoker=true) as
select owner_id,exercise_id,user_exercise_id,max(name_snapshot) as exercise_name,
max(heaviest_kg) as heaviest_kg,max(most_reps) as most_reps,max(estimated_1rm_kg) as estimated_1rm_kg
from public.exercise_progress group by owner_id,exercise_id,user_exercise_id;
grant select on public.personal_records to authenticated;
revoke all on public.personal_records from anon;
create function public.consent_server_timestamp() returns trigger language plpgsql set search_path='' as $$
begin new.accepted_at:=now(); return new; end $$;
create trigger consent_timestamp before insert on public.consent_acceptances for each row execute function public.consent_server_timestamp();
commit;
