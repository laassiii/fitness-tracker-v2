begin;
create extension if not exists pgtap with schema extensions;
select plan(32);
-- Disposable identities exist only inside this rolled-back local test transaction.
insert into auth.users(id,email) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls-a@example.invalid'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls-b@example.invalid');
insert into public.profiles(user_id,handle,display_name) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','rls_a','Test A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','rls_b','Test B');
insert into public.workout_plans(id,owner_id,name) values
('aaaaaaaa-0001-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Plan A'),
('bbbbbbbb-0001-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Plan B');
insert into public.workout_days(id,owner_id,plan_id,name,position) values
('aaaaaaaa-0002-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0001-4000-8000-000000000001','Day A',0),
('bbbbbbbb-0002-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0001-4000-8000-000000000001','Day B',0);
insert into public.planned_exercises(id,owner_id,day_id,exercise_id,position) values
('aaaaaaaa-0003-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0002-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',0);
insert into public.planned_set_targets(owner_id,planned_exercise_id,position,reps,weight_kg) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0003-4000-8000-000000000001',0,8,80);
insert into public.body_metric_entries(owner_id,weight_kg) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',80),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',90);

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.start_workout('bbbbbbbb-0002-4000-8000-000000000001','bbbbbbbb-0004-4000-8000-000000000001');
select is((select count(*)::int from public.profiles),1,'B sees only own profile');
select is((select count(*)::int from public.workout_plans),1,'B sees only own plan');
select is((select count(*)::int from public.body_metric_entries),1,'B sees only own metric');
select is((select count(*)::int from public.profiles where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),0,'B cannot read A profile');
select is((select count(*)::int from public.workout_plans where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),0,'B cannot read A plans');
select is((select count(*)::int from public.body_metric_entries where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),0,'B cannot read A metrics');
select throws_ok($$insert into public.body_metric_entries(owner_id,weight_kg) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',100)$$,'42501',null,'B cannot write A metric');

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select is((select count(*)::int from public.profiles),1,'A sees only own profile');
select is((select count(*)::int from public.workout_plans),1,'A sees only own plan');
select is((select count(*)::int from public.body_metric_entries),1,'A sees only own metric');
select is((select count(*)::int from public.profiles where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),0,'A cannot read B profile');
select is((select count(*)::int from public.workout_sessions where owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),0,'A cannot read B sessions');
select throws_ok($$insert into public.workout_plans(owner_id,name) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Forged')$$,'42501',null,'A cannot forge B ownership');
select throws_ok($$update public.profiles set user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'A cannot reassign profile ownership');
select throws_ok($$insert into public.workout_days(owner_id,plan_id,name,position) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-0001-4000-8000-000000000001','Foreign parent',1)$$,'23503',null,'Composite FK rejects B parent');
select throws_ok($$select public.start_workout('bbbbbbbb-0002-4000-8000-000000000001','aaaaaaaa-0004-4000-8000-000000000001')$$,'P0002',null,'RPC rejects B workout day');
select lives_ok($$select public.start_workout('aaaaaaaa-0002-4000-8000-000000000001','aaaaaaaa-0004-4000-8000-000000000002')$$,'A starts own session');
select is((select count(*)::int from public.workout_sessions),1,'A sees own session only');
select lives_ok($$select public.start_workout('aaaaaaaa-0002-4000-8000-000000000001','aaaaaaaa-0004-4000-8000-000000000002')$$,'Retry succeeds');
select is((select count(*)::int from public.workout_sessions),1,'Retry does not duplicate session');
select is((select name_snapshot from public.session_exercises limit 1),'Bench Press','Exercise name is snapshotted');
select lives_ok($$insert into public.performed_sets(owner_id,session_exercise_id,position,reps,weight_kg) select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id,0,8,80 from public.session_exercises$$,'A records a set');
select lives_ok($$update public.workout_sessions set status='completed',ended_at=now()$$,'A completes session');
select lives_ok($$update public.workout_days set name='Edited Day' where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'Plan may change');
select is((select name_snapshot from public.workout_sessions limit 1),'Day A','History survives day edit');
select lives_ok($$update public.planned_set_targets set reps=20$$,'Plan targets may change');
select is((select target_snapshot->0->>'reps' from public.session_exercises limit 1),'8','Historical targets survive edit');
select throws_ok($$update public.performed_sets set reps=99$$,'23514',null,'Closed session sets are immutable');
select throws_ok($$update public.workout_sessions set status='in_progress',ended_at=null$$,'23514',null,'Completed session cannot be reopened');
select is((select heaviest_kg::int from public.exercise_progress limit 1),80,'Progress derives completed working sets');
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select is((select count(*)::int from public.workout_sessions where owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),0,'B cannot read A historical session');
select is((select count(*)::int from public.performed_sets),0,'B cannot read A sets');
select * from finish();
rollback;
