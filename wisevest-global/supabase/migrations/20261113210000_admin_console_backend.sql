alter table public.profiles
  add column if not exists email text not null default '',
  add column if not exists role text not null default 'client',
  add column if not exists is_super_admin boolean not null default false,
  add column if not exists account_status text not null default 'active',
  add column if not exists kyc_status text not null default 'not_started';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('client', 'admin'));
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active', 'suspended'));
alter table public.profiles drop constraint if exists profiles_kyc_status_check;
alter table public.profiles add constraint profiles_kyc_status_check check (kyc_status in ('not_started', 'under_review', 'approved', 'rejected'));

update public.profiles p
set email = coalesce(u.email, ''),
    role = case when u.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else p.role end,
    is_super_admin = coalesce(u.raw_app_meta_data ->> 'role' = 'super_admin', false)
from auth.users u
where u.id = p.id;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, is_super_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_app_meta_data ->> 'role' = 'super_admin', false)
  )
  on conflict (id) do update
    set email = coalesce(new.email, ''),
        full_name = coalesce(new.raw_user_meta_data ->> 'full_name', public.profiles.full_name),
        is_super_admin = coalesce(new.raw_app_meta_data ->> 'role' = 'super_admin', false),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute procedure public.sync_profile_from_auth_user();

revoke all on function public.sync_profile_from_auth_user() from public, anon, authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_super_admin
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.account_status = 'active'
    );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.account_status = 'active'
  );
$$;

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Profiles visible to owner or admins" on public.profiles;
drop policy if exists "Users can update their own name" on public.profiles;
create policy "Profiles visible to owner or admins"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());
create policy "Users can update their own name"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id and account_status = 'active')
  with check (auth.uid() = id and account_status = 'active');
grant select on public.profiles to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

create table if not exists public.kyc_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  name text not null,
  country text not null,
  doc_type text not null,
  identity_document_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_cases_status_created_idx on public.kyc_cases (status, created_at desc);
create index if not exists kyc_cases_user_created_idx on public.kyc_cases (user_id, created_at desc);
alter table public.kyc_cases enable row level security;
drop policy if exists "Users and admins can read KYC cases" on public.kyc_cases;
create policy "Users and admins can read KYC cases"
  on public.kyc_cases for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());
grant select on public.kyc_cases to authenticated;
revoke insert, update, delete on public.kyc_cases from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Users upload their own KYC files" on storage.objects;
drop policy if exists "Users and admins read KYC files" on storage.objects;
create policy "Users upload their own KYC files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );
create policy "Users and admins read KYC files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kyc-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(14, 2) not null check (amount >= 100),
  method text not null check (method in ('BTC', 'USDT', 'USDC', 'Bank')),
  external_reference text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  review_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (method, external_reference)
);

create index if not exists deposit_requests_status_created_idx on public.deposit_requests (status, created_at desc);
create index if not exists deposit_requests_user_created_idx on public.deposit_requests (user_id, created_at desc);
alter table public.deposit_requests enable row level security;
drop policy if exists "Users and admins can read deposit requests" on public.deposit_requests;
create policy "Users and admins can read deposit requests"
  on public.deposit_requests for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());
grant select on public.deposit_requests to authenticated;
revoke insert, update, delete on public.deposit_requests from anon, authenticated;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(14, 2) not null check (amount >= 50),
  method text not null check (method in ('BTC', 'USDT', 'USDC', 'Bank')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending', 'awaiting_second', 'approved', 'rejected')),
  first_approver_id uuid references public.profiles (id) on delete set null,
  review_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists withdrawal_requests_status_created_idx on public.withdrawal_requests (status, created_at desc);
create index if not exists withdrawal_requests_user_created_idx on public.withdrawal_requests (user_id, created_at desc);
alter table public.withdrawal_requests enable row level security;
drop policy if exists "Users and admins can read withdrawal requests" on public.withdrawal_requests;
create policy "Users and admins can read withdrawal requests"
  on public.withdrawal_requests for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());
grant select on public.withdrawal_requests to authenticated;
revoke insert, update, delete on public.withdrawal_requests from anon, authenticated;

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null default '',
  action text not null,
  target_type text not null,
  target_id text,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
alter table public.audit_events enable row level security;
drop policy if exists "Admins can read audit events" on public.audit_events;
create policy "Admins can read audit events"
  on public.audit_events for select
  to authenticated
  using (public.is_admin());
grant select on public.audit_events to authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;

create or replace function public.write_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select p.email into v_email
  from public.profiles p
  where p.id = auth.uid();

  insert into public.audit_events (actor_id, actor_email, action, target_type, target_id, reason)
  values (auth.uid(), coalesce(v_email, ''), p_action, p_target_type, p_target_id, coalesce(p_reason, ''));
end;
$$;
revoke all on function public.write_audit(text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can change admin roles.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and is_super_admin) then
    raise exception 'Super admin access must be managed by a Supabase project owner.';
  end if;
  if p_role not in ('client', 'admin') then
    raise exception 'Choose a valid user role.';
  end if;

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'User not found.';
  end if;
  perform public.write_audit('user.role_changed', 'profile', p_user_id::text, p_role);
end;
$$;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

create or replace function public.admin_set_account_status(p_user_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account status.';
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and is_super_admin) then
    raise exception 'Super admin accounts must be managed by a Supabase project owner.';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'Choose a valid account status.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Give a reason of at least 5 characters.';
  end if;

  update public.profiles
  set account_status = p_status, updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception 'User not found.';
  end if;
  perform public.write_audit('user.account_status_changed', 'profile', p_user_id::text, p_status || ': ' || trim(p_reason));
end;
$$;
revoke all on function public.admin_set_account_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;

create or replace function public.submit_kyc(
  p_name text,
  p_country text,
  p_doc_type text,
  p_identity_document_path text,
  p_selfie_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_kyc_status text;
  v_case_id uuid;
begin
  if v_user_id is null or not public.is_active_user() then
    raise exception 'An active signed-in account is required.';
  end if;
  if coalesce(trim(p_country), '') = '' or coalesce(trim(p_doc_type), '') = '' then
    raise exception 'Country and document type are required.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Enter your full legal name.';
  end if;
  if p_identity_document_path not like v_user_id::text || '/%' or p_selfie_path not like v_user_id::text || '/%' then
    raise exception 'Invalid document path.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'kyc-documents' and name = p_identity_document_path)
     or not exists (select 1 from storage.objects where bucket_id = 'kyc-documents' and name = p_selfie_path) then
    raise exception 'Upload both verification documents before submitting.';
  end if;
  select kyc_status into v_kyc_status from public.profiles where id = v_user_id;
  if v_kyc_status = 'approved' then
    raise exception 'Identity verification is already approved.';
  end if;
  if exists (select 1 from public.kyc_cases where user_id = v_user_id and status = 'pending') then
    raise exception 'A verification case is already under review.';
  end if;

  v_name := trim(p_name);
  update public.profiles set full_name = v_name, updated_at = now() where id = v_user_id;
  insert into public.kyc_cases (user_id, name, country, doc_type, identity_document_path, selfie_path)
  values (v_user_id, v_name, trim(p_country), trim(p_doc_type), p_identity_document_path, p_selfie_path)
  returning id into v_case_id;

  update public.profiles set kyc_status = 'under_review', updated_at = now() where id = v_user_id;
  perform public.write_audit('kyc.submitted', 'kyc_case', v_case_id::text, '');
  return v_case_id;
end;
$$;
revoke all on function public.submit_kyc(text, text, text, text, text) from public, anon;
grant execute on function public.submit_kyc(text, text, text, text, text) to authenticated;

create or replace function public.admin_review_kyc(p_case_id uuid, p_decision text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.kyc_cases%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject.';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters.';
  end if;

  select * into v_case from public.kyc_cases where id = p_case_id for update;
  if not found then
    raise exception 'Case not found.';
  end if;
  if v_case.status <> 'pending' then
    raise exception 'This case has already been reviewed.';
  end if;

  update public.kyc_cases
  set status = p_decision, review_reason = nullif(trim(coalesce(p_reason, '')), ''),
      reviewed_by = auth.uid(), updated_at = now()
  where id = p_case_id;
  update public.profiles
  set kyc_status = p_decision, updated_at = now()
  where id = v_case.user_id;
  perform public.write_audit('kyc.' || p_decision, 'kyc_case', p_case_id::text, coalesce(p_reason, ''));
end;
$$;
revoke all on function public.admin_review_kyc(uuid, text, text) from public, anon;
grant execute on function public.admin_review_kyc(uuid, text, text) to authenticated;

create or replace function public.submit_deposit_request(p_amount numeric, p_method text, p_external_reference text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in account is required.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and kyc_status = 'approved') then
    raise exception 'Complete identity verification before requesting a deposit.';
  end if;
  if p_amount < 100 then
    raise exception 'Minimum deposit is $100.';
  end if;
  if p_method not in ('BTC', 'USDT', 'USDC', 'Bank') then
    raise exception 'Choose a valid payment method.';
  end if;
  if length(trim(coalesce(p_external_reference, ''))) < 8 then
    raise exception 'Enter a transaction reference of at least 8 characters.';
  end if;

  insert into public.deposit_requests (user_id, amount, method, external_reference)
  values (auth.uid(), p_amount, p_method, trim(p_external_reference))
  returning id into v_id;
  perform public.write_audit('deposit.requested', 'deposit_request', v_id::text, '');
  return v_id;
exception
  when unique_violation then
    raise exception 'This transaction reference has already been submitted.';
end;
$$;
revoke all on function public.submit_deposit_request(numeric, text, text) from public, anon;
grant execute on function public.submit_deposit_request(numeric, text, text) to authenticated;

create or replace function public.admin_review_deposit(p_request_id uuid, p_decision text, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.deposit_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'Choose verify or reject.';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters.';
  end if;

  select * into v_request from public.deposit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Deposit request not found.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  update public.deposit_requests
  set status = p_decision, review_reason = nullif(trim(coalesce(p_reason, '')), ''),
      reviewed_by = auth.uid(), updated_at = now()
  where id = p_request_id;
  perform public.write_audit('deposit.' || p_decision, 'deposit_request', p_request_id::text, coalesce(p_reason, ''));
end;
$$;
revoke all on function public.admin_review_deposit(uuid, text, text) from public, anon;
grant execute on function public.admin_review_deposit(uuid, text, text) to authenticated;

create or replace function public.submit_withdrawal_request(p_amount numeric, p_method text, p_destination text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_kyc_status text;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'An active signed-in account is required.';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enroll in and verify Supabase multi-factor authentication before requesting a withdrawal.';
  end if;
  select kyc_status into v_kyc_status from public.profiles where id = auth.uid();
  if v_kyc_status <> 'approved' then
    raise exception 'Complete identity verification before requesting a withdrawal.';
  end if;
  if p_amount < 50 then
    raise exception 'Minimum withdrawal is $50.';
  end if;
  if p_method not in ('BTC', 'USDT', 'USDC', 'Bank') then
    raise exception 'Choose a valid withdrawal method.';
  end if;
  if length(trim(coalesce(p_destination, ''))) < 8 then
    raise exception 'Enter a valid destination.';
  end if;

  insert into public.withdrawal_requests (user_id, amount, method, destination)
  values (auth.uid(), p_amount, p_method, trim(p_destination))
  returning id into v_id;
  perform public.write_audit('withdrawal.requested', 'withdrawal_request', v_id::text, '');
  return v_id;
end;
$$;
revoke all on function public.submit_withdrawal_request(numeric, text, text) from public, anon;
grant execute on function public.submit_withdrawal_request(numeric, text, text) to authenticated;

create or replace function public.admin_review_withdrawal(
  p_request_id uuid,
  p_decision text,
  p_reason text default ''
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.withdrawal_requests%rowtype;
  v_next_status text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Choose approve or reject.';
  end if;
  if p_decision = 'reject' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters.';
  end if;

  select * into v_request from public.withdrawal_requests where id = p_request_id for update;
  if not found then
    raise exception 'Withdrawal request not found.';
  end if;
  if v_request.status not in ('pending', 'awaiting_second') then
    raise exception 'This request has already been reviewed.';
  end if;

  if p_decision = 'reject' then
    v_next_status := 'rejected';
  elsif v_request.amount > 10000 and v_request.status = 'pending' then
    v_next_status := 'awaiting_second';
  else
    if v_request.amount > 10000 and v_request.first_approver_id = auth.uid() then
      raise exception 'A different admin must provide the second approval.';
    end if;
    v_next_status := 'approved';
  end if;

  update public.withdrawal_requests
  set status = v_next_status,
      first_approver_id = case when v_next_status = 'awaiting_second' then auth.uid() else first_approver_id end,
      review_reason = nullif(trim(coalesce(p_reason, '')), ''),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_request_id;
  perform public.write_audit(
    'withdrawal.' || v_next_status,
    'withdrawal_request',
    p_request_id::text,
    case when v_next_status = 'awaiting_second' then 'First approval; second approval required.' else coalesce(p_reason, '') end
  );
  return v_next_status;
end;
$$;
revoke all on function public.admin_review_withdrawal(uuid, text, text) from public, anon;
grant execute on function public.admin_review_withdrawal(uuid, text, text) to authenticated;

create table if not exists public.project_valuations (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects (id) on delete restrict,
  change_pct numeric(7, 3) not null check (change_pct between -100 and 100),
  source_note text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists projects_name_case_insensitive_idx on public.projects (lower(name));

alter table public.project_valuations enable row level security;
drop policy if exists "Admins can read project valuations" on public.project_valuations;
create policy "Admins can read project valuations"
  on public.project_valuations for select
  to authenticated
  using (public.is_admin());
grant select on public.project_valuations to authenticated;
revoke insert, update, delete on public.project_valuations from anon, authenticated;

create or replace function public.admin_post_project_valuation(p_project_id text, p_change_pct numeric, p_source_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_change_pct < -100 or p_change_pct > 100 then
    raise exception 'Enter a percentage between -100 and 100.';
  end if;
  if length(trim(coalesce(p_source_note, ''))) < 10 then
    raise exception 'Add a valuation source of at least 10 characters.';
  end if;

  insert into public.project_valuations (project_id, change_pct, source_note, created_by)
  values (p_project_id, p_change_pct, trim(p_source_note), auth.uid());
  update public.projects set last_valuation = current_date::text, updated_at = now() where id = p_project_id;
  if not found then
    raise exception 'Project not found.';
  end if;
  perform public.write_audit('project.valuation_posted', 'project', p_project_id, trim(p_source_note));
end;
$$;
revoke all on function public.admin_post_project_valuation(text, numeric, text) from public, anon;
grant execute on function public.admin_post_project_valuation(text, numeric, text) to authenticated;

create or replace function public.audit_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('project.created', 'project', new.id, 'Created as ' || new.status);
    return new;
  end if;
  if old.status is distinct from new.status then
    perform public.write_audit('project.status_changed', 'project', new.id, old.status || ' -> ' || new.status);
  else
    perform public.write_audit('project.updated', 'project', new.id, '');
  end if;
  return new;
end;
$$;
revoke all on function public.audit_project_change() from public, anon, authenticated;

drop trigger if exists projects_audit_change on public.projects;
create trigger projects_audit_change
  after insert or update on public.projects
  for each row execute procedure public.audit_project_change();

drop policy if exists "Admins can manage projects" on public.projects;
create policy "Admins can manage projects"
  on public.projects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
grant insert, update on public.projects to authenticated;
revoke delete on public.projects from authenticated;
