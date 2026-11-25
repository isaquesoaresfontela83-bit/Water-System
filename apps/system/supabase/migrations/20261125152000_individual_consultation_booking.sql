create table if not exists public.water_individual_consultations (
  id uuid primary key,
  contact_name text not null check (char_length(contact_name) between 2 and 100),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  contact_phone text not null check (contact_phone ~ '^\+[0-9]{10,15}$'),
  meeting_at timestamptz not null,
  modules text[] not null default '{}' check (cardinality(modules) <= 17),
  notes text not null default '' check (char_length(notes) <= 600),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by text
);

alter table public.water_individual_consultations enable row level security;
revoke all on public.water_individual_consultations from public, anon, authenticated;
grant select, insert, update on public.water_individual_consultations to service_role;

create unique index if not exists water_one_confirmed_consultation_per_time
  on public.water_individual_consultations (meeting_at) where status = 'confirmed';

create or replace function public.water_book_individual_consultation(p_record jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  submitted_id uuid := (p_record->>'id')::uuid;
  submitted_at timestamptz := (p_record->>'meeting_at')::timestamptz;
  submitted_modules text[] := array(select jsonb_array_elements_text(p_record->'modules'));
  saved_id uuid;
begin
  if submitted_at > statement_timestamp() then
    insert into public.water_individual_consultations (
      id, contact_name, contact_email, contact_phone, meeting_at, modules, notes
    ) values (
      submitted_id, p_record->>'contact_name', p_record->>'contact_email', p_record->>'contact_phone',
      submitted_at, submitted_modules, p_record->>'notes'
    ) on conflict (id) do nothing;
  end if;
  select id into saved_id
    from public.water_individual_consultations
    where id = submitted_id
      and contact_name = p_record->>'contact_name'
      and contact_email = p_record->>'contact_email'
      and contact_phone = p_record->>'contact_phone'
      and meeting_at = submitted_at
      and modules = submitted_modules
      and notes = p_record->>'notes';
  return saved_id;
end;
$function$;

revoke execute on function public.water_book_individual_consultation(jsonb) from public, anon, authenticated;
grant execute on function public.water_book_individual_consultation(jsonb) to service_role;
