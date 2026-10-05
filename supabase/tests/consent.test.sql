begin;
select plan(8);
insert into auth.users(id,email,raw_user_meta_data) values
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','consent-test@example.invalid','{"consent_signup":{"accepted":true,"versions":{"terms":"2026-10-v1","privacy":"2026-10-v1"},"accepted_at":"1900-01-01","user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}}');
select is((select count(*)::int from public.consent_acceptances where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),2,'Signup records both declarations for Auth-generated identity');
select ok((select bool_and(accepted_at>=now()-interval '1 minute') from public.consent_acceptances where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'Timestamp is server-generated, not metadata timestamp');
select ok((select bool_and(content_hash=encode(extensions.digest(content,'sha256'),'hex')) from public.legal_document_versions),'Document hash matches published content');
select ok(not has_function_privilege('authenticated','public.record_signup_consent()','EXECUTE'),'Privileged signup trigger is not directly executable');
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select lives_ok($$select public.accept_current_documents('2026-10-v1','2026-10-v1')$$,'Reacceptance is idempotent');
select is((select count(*)::int from public.consent_acceptances),2,'Reacceptance retains exactly two versioned records');
select throws_ok($$select public.accept_current_documents('unpublished','2026-10-v1')$$,'23514',null,'Cannot accept unpublished versions through RPC');
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
select is((select count(*)::int from public.consent_acceptances),0,'Consent records are isolated');
select * from finish();rollback;
