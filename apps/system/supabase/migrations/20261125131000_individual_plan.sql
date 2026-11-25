alter table public.organizations
  add column if not exists individual_plan text;

comment on column public.organizations.individual_plan is
  'Configuração do plano Individual. Escrita pelo Water Control após consultoria.';

-- Preserve the existing owner, capacity and duplicate checks for branch creation.
create or replace function public.fama_create_branch(
  p_parent_id text, p_actor_id text, p_name text, p_name_key text,
  p_manager_email text default '', p_manager_name text default '', p_user_limit integer default 6
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  parent public.organizations%rowtype;
  owner_member public.organization_members%rowtype;
  child public.organizations%rowtype;
  child_id text := pg_catalog.gen_random_uuid()::text;
  manager_email text := pg_catalog.lower(pg_catalog.btrim(p_manager_email));
  users_count integer;
begin
  select * into parent from public.organizations where id=p_parent_id for update;
  if parent.id is null or parent.parent_organization_id is not null or parent.status<>'active' or not (
    parent.plan in ('intermediario', 'profissional') or
    case when parent.plan='individual' then
      coalesce((parent.individual_plan::jsonb->'selection') ? 'branches', false)
    else false end
  ) then raise exception 'FAMA_BRANCH_PLAN'; end if;
  select * into owner_member from public.organization_members where organization_id=p_parent_id and user_id=p_actor_id and role='owner' and status='active' limit 1;
  if owner_member.id is null then raise exception 'FAMA_BRANCH_OWNER'; end if;
  if pg_catalog.length(pg_catalog.btrim(p_name)) not between 2 and 80 or pg_catalog.length(p_name_key)<2 then raise exception 'FAMA_BRANCH_NAME'; end if;
  if manager_email<>'' and manager_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'FAMA_BRANCH_EMAIL'; end if;
  if exists(select 1 from public.organizations where parent_organization_id=p_parent_id and status<>'deleted' and name_key=p_parent_id||':'||p_name_key) then raise exception 'FAMA_BRANCH_DUPLICATE'; end if;
  if manager_email<>'' then
    select count(distinct pg_catalog.lower(m.user_email)) into users_count
      from public.organization_members m join public.organizations o on o.id=m.organization_id
      where (o.id=p_parent_id or o.parent_organization_id=p_parent_id) and o.status<>'deleted' and m.status in ('active','invited');
    if users_count>=p_user_limit and not exists(
      select 1 from public.organization_members m join public.organizations o on o.id=m.organization_id
      where (o.id=p_parent_id or o.parent_organization_id=p_parent_id) and o.status<>'deleted' and m.status in ('active','invited')
        and pg_catalog.lower(m.user_email)=manager_email
    ) then raise exception 'FAMA_BRANCH_USER_LIMIT'; end if;
  end if;
  insert into public.organizations(id,name,slug,name_key,status,created_by_user_id,parent_organization_id,plan,plan_status,plan_expires_at,billing_enabled,block_on_expiry,billing_provider)
  values(child_id,pg_catalog.btrim(p_name),'filial-'||child_id,p_parent_id||':'||p_name_key,'active','',p_parent_id,parent.plan,parent.plan_status,parent.plan_expires_at,false,false,'parent') returning * into child;
  insert into public.organization_members(id,organization_id,user_id,user_email,display_name,role,status,permissions)
  values(pg_catalog.gen_random_uuid()::text,child_id,owner_member.user_id,owner_member.user_email,owner_member.display_name,'owner','active',owner_member.permissions);
  if manager_email<>'' and manager_email<>pg_catalog.lower(owner_member.user_email) then
    insert into public.organization_members(id,organization_id,user_id,user_email,display_name,role,status)
    values(pg_catalog.gen_random_uuid()::text,child_id,'',manager_email,pg_catalog.left(p_manager_name,80),'admin','invited');
  end if;
  return pg_catalog.to_jsonb(child);
end;
$function$;
