-- Validated locally in the workflow milestone. Do not apply remotely until deployment approval.
begin;
alter table public.legal_document_versions add column content text not null default '';
insert into public.legal_document_versions(document_type,version,content_hash,document_url,is_current,content)
select document_type,'2026-10-v1',encode(extensions.digest(content,'sha256'),'hex'),'/legal/'||document_type,true,content from (values
('terms',$terms$Terms of Service — template requiring review
Version 2026-10-v1

This is a private fitness tracking application. These terms are a development template and have not been legally reviewed. Before public or commercial use, the operator must supply their identity/contact details and obtain appropriate review, including jurisdiction, age eligibility, liability and dispute provisions.

Use your own account and keep your login credentials secure. Do not access another person's private information or misuse the service. You control the fitness records you enter. Workout templates and estimated strength statistics are general tracking aids, not individualized medical or training advice.

The service may be unavailable or change. Do not rely on it for emergency or medical decisions. Contact the operator for account or data requests; operator contact details must be completed before public launch. Updated terms require explicit acceptance of the new version.$terms$),
('privacy',$privacy$Privacy Policy — template requiring review
Version 2026-10-v1

This development template describes the intended data flow and requires operator identity/contact details, retention periods, hosting-region disclosures and appropriate legal review before public or commercial use.

The application records your email through Supabase Auth, your profile, workout plans, actual sessions and sets, optional body measurements, and document acceptance versions/timestamps. Fitness information is private to your authenticated account in Phase 1. No friends or public sharing are enabled.

The browser sends requests to the application API; Supabase hosts authentication and PostgreSQL data. Cloudflare hosts the intended frontend/API. Password handling is delegated to Supabase Auth. Access tokens are held in browser memory; an essential HttpOnly authentication cookie restores your session. Fitness records are not persisted in a browser database. No optional analytics or tracking cookies are included.

Operational services may process network metadata for security. Consent records do not intentionally collect IP addresses. Records remain server-side until appropriately erased; retention and backup erasure procedures must be completed before public launch. Contact the operator for access, correction, export or deletion requests; operator contact details must be supplied before public launch.$privacy$)
) as docs(document_type,content);

create function public.accept_current_documents(p_terms text,p_privacy text) returns void
language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.legal_document_versions where document_type='terms' and version=p_terms and is_current)
    or not exists(select 1 from public.legal_document_versions where document_type='privacy' and version=p_privacy and is_current) then
    raise exception 'Current document versions required' using errcode='23514';
  end if;
  insert into public.consent_acceptances(user_id,document_type,document_version) values
    (auth.uid(),'terms',p_terms),(auth.uid(),'privacy',p_privacy) on conflict(user_id,document_type,document_version) do nothing;
end $$;
revoke all on function public.accept_current_documents(text,text) from public,anon;
grant execute on function public.accept_current_documents(text,text) to authenticated;

create function public.create_plan_from_template(p_template_id uuid,p_name text,p_key uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare pid uuid; did uuid; peid uuid; ex record; begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
  select id into pid from public.workout_plans where id=p_key and owner_id=auth.uid();
  if pid is not null then return pid; end if;
  if not exists(select 1 from public.workout_templates where id=p_template_id) then raise exception 'Template not found' using errcode='P0002'; end if;
  insert into public.workout_plans(id,owner_id,name) values(p_key,auth.uid(),p_name) returning id into pid;
  insert into public.workout_days(owner_id,plan_id,name,position) values(auth.uid(),pid,p_name,0) returning id into did;
  for ex in select * from public.template_exercises where template_id=p_template_id order by position loop
    insert into public.planned_exercises(owner_id,day_id,exercise_id,position) values(auth.uid(),did,ex.exercise_id,ex.position) returning id into peid;
    insert into public.planned_set_targets(owner_id,planned_exercise_id,position,reps,weight_kg,rest_seconds)
    select auth.uid(),peid,position,reps,weight_kg,rest_seconds from public.template_set_targets where template_exercise_id=ex.id;
  end loop;
  return pid;
end $$;
revoke all on function public.create_plan_from_template(uuid,text,uuid) from public,anon;
grant execute on function public.create_plan_from_template(uuid,text,uuid) to authenticated;

create function public.log_set(p_id uuid,p_session_exercise_id uuid,p_position integer,p_reps integer,p_weight_kg numeric,p_type text default 'working',p_rpe numeric default null,p_notes text default '') returns public.performed_sets
language plpgsql security invoker set search_path='' as $$
declare row public.performed_sets; sid uuid; state text; begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_id::text,0));
  select * into row from public.performed_sets where id=p_id and owner_id=auth.uid();
  if row.id is not null then
    if row.session_exercise_id<>p_session_exercise_id or row.position<>p_position or row.reps<>p_reps or row.weight_kg<>p_weight_kg or row.set_type<>p_type or row.rpe is distinct from p_rpe or row.notes<>p_notes then raise exception 'Retry payload changed' using errcode='23505'; end if;
    return row;
  end if;
  select e.session_id,s.status into sid,state from public.session_exercises e join public.workout_sessions s on s.id=e.session_id where e.id=p_session_exercise_id and e.owner_id=auth.uid() for update of s;
  if state is distinct from 'in_progress' then raise exception 'Session is closed or inaccessible' using errcode='23514'; end if;
  insert into public.performed_sets(id,owner_id,session_exercise_id,position,reps,weight_kg,set_type,rpe,notes)
  values(p_id,auth.uid(),p_session_exercise_id,p_position,p_reps,p_weight_kg,p_type,p_rpe,p_notes) returning * into row;
  return row;
end $$;
revoke all on function public.log_set(uuid,uuid,integer,integer,numeric,text,numeric,text) from public,anon;
grant execute on function public.log_set(uuid,uuid,integer,integer,numeric,text,numeric,text) to authenticated;
commit;
