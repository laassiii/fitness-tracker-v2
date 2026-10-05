begin;
-- Narrow privileged operation: record declared consent for the Auth-generated NEW.id
-- during account creation, before a verified user JWT exists. No Worker admin key.
create function public.record_signup_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare declaration jsonb; terms text; privacy text; begin
  declaration:=new.raw_user_meta_data->'consent_signup';
  terms:=declaration->'versions'->>'terms';privacy:=declaration->'versions'->>'privacy';
  if declaration->'accepted'='true'::jsonb
    and exists(select 1 from public.legal_document_versions where document_type='terms' and version=terms and is_current)
    and exists(select 1 from public.legal_document_versions where document_type='privacy' and version=privacy and is_current) then
    insert into public.consent_acceptances(user_id,document_type,document_version) values(new.id,'terms',terms),(new.id,'privacy',privacy);
  end if;
  return new;
end $$;
revoke all on function public.record_signup_consent() from public,anon,authenticated;
create trigger auth_signup_consent after insert on auth.users for each row execute function public.record_signup_consent();
commit;
