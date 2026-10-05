-- Phase 1 only. No legacy personal data and no social schema.
begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (length(display_name) between 1 and 80),
  bio text not null default '' check (length(bio) <= 500),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_unit text not null default 'kg' check (weight_unit in ('kg','lb')),
  timezone text not null default 'UTC' check (length(timezone) between 1 and 80),
  updated_at timestamptz not null default now()
);
create table public.privacy_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  visibility text not null default 'private' check (visibility = 'private'),
  updated_at timestamptz not null default now()
);
create table public.exercises (
  id uuid primary key default gen_random_uuid(), name text not null unique check (length(name) between 1 and 100),
  muscle_group text not null check (length(muscle_group) between 1 and 80),
  equipment text not null check (length(equipment) between 1 and 80),
  instructions text not null default '' check (length(instructions) <= 3000),
  created_at timestamptz not null default now()
);
create table public.user_exercises (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  canonical_exercise_id uuid references public.exercises(id) on delete set null,
  name text not null check (length(name) between 1 and 100), muscle_group text not null default 'Other',
  equipment text not null default 'Other', instructions text not null default '' check (length(instructions) <= 3000),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id, owner_id)
);
create unique index user_exercises_active_name on public.user_exercises(owner_id, lower(name)) where archived_at is null;

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text not null default '', created_at timestamptz not null default now()
);
create table public.template_exercises (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null check(position between 0 and 99), unique(template_id,position)
);
create table public.template_set_targets (
  id uuid primary key default gen_random_uuid(), template_exercise_id uuid not null references public.template_exercises(id) on delete cascade,
  position integer not null check(position between 0 and 49), reps integer check(reps between 1 and 1000),
  weight_kg numeric(8,3) check(weight_kg between 0 and 2000), rest_seconds integer check(rest_seconds between 0 and 3600),
  unique(template_exercise_id,position)
);
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(name) between 1 and 100), description text not null default '' check(length(description) <= 2000),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,owner_id)
);
create index plans_owner_created on public.workout_plans(owner_id,created_at desc,id desc);
create table public.workout_days (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null, name text not null check(length(name) between 1 and 100), position integer not null check(position between 0 and 99),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(plan_id,owner_id) references public.workout_plans(id,owner_id) on delete cascade,
  unique(id,owner_id), unique(plan_id,position)
);
create table public.planned_exercises (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  day_id uuid not null, exercise_id uuid references public.exercises(id) on delete restrict,
  user_exercise_id uuid, position integer not null check(position between 0 and 99), notes text not null default '' check(length(notes) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((exercise_id is null) <> (user_exercise_id is null)),
  foreign key(day_id,owner_id) references public.workout_days(id,owner_id) on delete cascade,
  foreign key(user_exercise_id,owner_id) references public.user_exercises(id,owner_id) on delete restrict,
  unique(id,owner_id), unique(day_id,position)
);
create table public.planned_set_targets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  planned_exercise_id uuid not null, position integer not null check(position between 0 and 49),
  reps integer check(reps between 1 and 1000), weight_kg numeric(8,3) check(weight_kg between 0 and 2000),
  rest_seconds integer check(rest_seconds between 0 and 3600),
  foreign key(planned_exercise_id,owner_id) references public.planned_exercises(id,owner_id) on delete cascade,
  unique(planned_exercise_id,position), unique(id,owner_id)
);
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  source_day_id uuid, name_snapshot text not null check(length(name_snapshot) between 1 and 100),
  status text not null default 'in_progress' check(status in ('in_progress','completed','discarded')),
  started_at timestamptz not null default now(), ended_at timestamptz,
  notes text not null default '' check(length(notes) <= 2000),
  idempotency_key uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(source_day_id,owner_id) references public.workout_days(id,owner_id) on delete set null (source_day_id),
  check(ended_at is null or ended_at >= started_at),
  check((status = 'in_progress' and ended_at is null) or (status <> 'in_progress' and ended_at is not null)),
  unique(id,owner_id), unique(owner_id,idempotency_key)
);
create index sessions_history on public.workout_sessions(owner_id,started_at desc,id desc);
create table public.session_exercises (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null, exercise_id uuid references public.exercises(id) on delete restrict,
  user_exercise_id uuid, name_snapshot text not null check(length(name_snapshot) between 1 and 100),
  target_snapshot jsonb not null default '[]' check(jsonb_typeof(target_snapshot) = 'array'),
  position integer not null check(position between 0 and 99), notes text not null default '' check(length(notes) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((exercise_id is null) <> (user_exercise_id is null)),
  foreign key(session_id,owner_id) references public.workout_sessions(id,owner_id) on delete cascade,
  foreign key(user_exercise_id,owner_id) references public.user_exercises(id,owner_id) on delete restrict,
  unique(id,owner_id), unique(session_id,position)
);
create table public.performed_sets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  session_exercise_id uuid not null, position integer not null check(position between 0 and 49),
  set_type text not null default 'working' check(set_type in ('working','warmup')),
  reps integer not null check(reps between 1 and 1000), weight_kg numeric(8,3) not null check(weight_kg between 0 and 2000),
  rpe numeric(3,1) check(rpe between 1 and 10), completed_at timestamptz not null default now(),
  notes text not null default '' check(length(notes) <= 1000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(session_exercise_id,owner_id) references public.session_exercises(id,owner_id) on delete cascade,
  unique(session_exercise_id,position), unique(id,owner_id)
);
create table public.body_metric_entries (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  observed_at timestamptz not null default now(), weight_kg numeric(6,3) check(weight_kg between 1 and 500),
  body_fat_percent numeric(5,2) check(body_fat_percent between 0 and 100),
  waist_cm numeric(6,2) check(waist_cm between 1 and 500), chest_cm numeric(6,2) check(chest_cm between 1 and 500),
  notes text not null default '' check(length(notes) <= 1000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(num_nonnulls(weight_kg,body_fat_percent,waist_cm,chest_cm) > 0)
);
create index metrics_owner_time on public.body_metric_entries(owner_id,observed_at desc,id desc);
create table public.legal_document_versions (
  document_type text not null check(document_type in ('terms','privacy')), version text not null,
  content_hash text not null check(length(content_hash)=64), document_url text not null,
  published_at timestamptz not null default now(), is_current boolean not null default false,
  primary key(document_type,version)
);
create unique index legal_current_type on public.legal_document_versions(document_type) where is_current;
create table public.consent_acceptances (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null, document_version text not null, accepted_at timestamptz not null default now(),
  foreign key(document_type,document_version) references public.legal_document_versions(document_type,version) on delete restrict,
  unique(user_id,document_type,document_version)
);

-- Redundant owner columns support indexed RLS; composite FKs enforce parent ownership.
do $$ declare t text; col text; begin
  foreach t in array array['profiles','preferences','privacy_settings','user_exercises','workout_plans','workout_days','planned_exercises','planned_set_targets','workout_sessions','session_exercises','performed_sets','body_metric_entries','consent_acceptances'] loop
    col := case when t in ('profiles','preferences','privacy_settings','consent_acceptances') then 'user_id' else 'owner_id' end;
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (%I = (select auth.uid()))',t,col);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (%I = (select auth.uid()))',t,col);
    if t <> 'consent_acceptances' then
      execute format('create policy owner_update on public.%I for update to authenticated using (%I = (select auth.uid())) with check (%I = (select auth.uid()))',t,col,col);
      execute format('create policy owner_delete on public.%I for delete to authenticated using (%I = (select auth.uid()))',t,col);
    end if;
    execute format('grant select, insert on public.%I to authenticated',t);
    if t <> 'consent_acceptances' then execute format('grant update, delete on public.%I to authenticated',t); end if;
    execute format('revoke all on public.%I from anon',t);
    execute format('create index on public.%I (%I)',t,col);
  end loop;
  foreach t in array array['exercises','workout_templates','template_exercises','template_set_targets','legal_document_versions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy catalog_read on public.%I for select to authenticated using (true)',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('revoke insert, update, delete on public.%I from authenticated',t);
    execute format('revoke all on public.%I from anon',t);
  end loop;
end $$;
grant select on public.legal_document_versions to anon;
create policy public_legal_read on public.legal_document_versions for select to anon using(true);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','preferences','privacy_settings','user_exercises','workout_plans','workout_days','planned_exercises','workout_sessions','session_exercises','performed_sets','body_metric_entries'] loop
    execute format('create trigger updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
end $$;

-- Completed/discarded sessions and their sets are immutable through ordinary roles.
create function public.guard_session_change() returns trigger language plpgsql set search_path = '' as $$
begin
  -- Account erasure/admin maintenance only; these roles are never Worker credentials.
  if current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if old.status <> 'in_progress' and not (tg_op='UPDATE' and new.source_day_id is null and old.source_day_id is not null and (to_jsonb(new)-'source_day_id'-'updated_at')=(to_jsonb(old)-'source_day_id'-'updated_at')) then
    raise exception 'Session is closed' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.owner_id <> old.owner_id then raise exception 'Ownership is immutable' using errcode='23514'; end if;
  return new;
end $$;
create trigger session_closed before update or delete on public.workout_sessions for each row execute function public.guard_session_change();
create function public.guard_session_child() returns trigger language plpgsql set search_path = '' as $$
declare sid uuid; state text; begin
  if current_user in ('postgres','supabase_admin','supabase_auth_admin','service_role') then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if tg_table_name='session_exercises' then
    sid := case when tg_op='DELETE' then old.session_id else new.session_id end;
    if tg_op='UPDATE' and (new.session_id<>old.session_id or new.owner_id<>old.owner_id) then raise exception 'Parent is immutable' using errcode='23514'; end if;
  else
    if tg_op='UPDATE' and (new.session_exercise_id<>old.session_exercise_id or new.owner_id<>old.owner_id) then raise exception 'Parent is immutable' using errcode='23514'; end if;
    select session_id into sid from public.session_exercises where id=case when tg_op='DELETE' then old.session_exercise_id else new.session_exercise_id end;
  end if;
  select status into state from public.workout_sessions where id=sid for update;
  if state is distinct from 'in_progress' then raise exception 'Session is closed or inaccessible' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger session_child_closed before insert or update or delete on public.session_exercises for each row execute function public.guard_session_child();
create trigger set_session_closed before insert or update or delete on public.performed_sets for each row execute function public.guard_session_child();

create function public.start_workout(p_day_id uuid, p_idempotency_key uuid, p_name text default 'Workout') returns uuid
language plpgsql security invoker set search_path = '' as $$
declare sid uuid; day_name text; pe record; se_id uuid; begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Serialize retries for a user/key; snapshot creation is one transaction.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_idempotency_key::text,0));
  select id into sid from public.workout_sessions where owner_id=auth.uid() and idempotency_key=p_idempotency_key;
  if sid is not null then return sid; end if;
  if p_day_id is not null then
    select d.name into day_name from public.workout_days d join public.workout_plans p on p.id=d.plan_id where d.id=p_day_id and d.owner_id=auth.uid() and p.archived_at is null;
    if day_name is null then raise exception 'Workout day not found' using errcode='P0002'; end if;
  end if;
  insert into public.workout_sessions(owner_id,source_day_id,name_snapshot,idempotency_key) values(auth.uid(),p_day_id,coalesce(day_name,p_name),p_idempotency_key) returning id into sid;
  for pe in select p.*,coalesce(e.name,u.name) as snapshot_name from public.planned_exercises p left join public.exercises e on e.id=p.exercise_id left join public.user_exercises u on u.id=p.user_exercise_id where p.day_id=p_day_id and p.owner_id=auth.uid() order by p.position loop
    insert into public.session_exercises(owner_id,session_id,exercise_id,user_exercise_id,name_snapshot,position,target_snapshot)
    values(auth.uid(),sid,pe.exercise_id,pe.user_exercise_id,pe.snapshot_name,pe.position,
      coalesce((select jsonb_agg(jsonb_build_object('position',t.position,'reps',t.reps,'weight_kg',t.weight_kg,'rest_seconds',t.rest_seconds) order by t.position) from public.planned_set_targets t where t.planned_exercise_id=pe.id),'[]'::jsonb)) returning id into se_id;
  end loop;
  return sid;
end $$;
revoke all on function public.start_workout(uuid,uuid,text) from public,anon;
grant execute on function public.start_workout(uuid,uuid,text) to authenticated;

create view public.exercise_progress with (security_invoker=true) as
select s.owner_id,e.exercise_id,e.user_exercise_id,e.name_snapshot,s.started_at,
  max(t.weight_kg) as heaviest_kg,max(t.reps) as most_reps,
  max(case when t.reps between 1 and 10 and t.weight_kg>0 then t.weight_kg*(1+t.reps::numeric/30) end) as estimated_1rm_kg,
  sum(t.weight_kg*t.reps) as volume_kg
from public.workout_sessions s join public.session_exercises e on e.session_id=s.id join public.performed_sets t on t.session_exercise_id=e.id
where s.status='completed' and t.set_type='working'
group by s.owner_id,e.exercise_id,e.user_exercise_id,e.name_snapshot,s.started_at;
grant select on public.exercise_progress to authenticated;
revoke all on public.exercise_progress from anon;

commit;
