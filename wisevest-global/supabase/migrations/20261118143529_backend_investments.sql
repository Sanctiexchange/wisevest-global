alter table public.projects
  add column if not exists funding_goal numeric(14, 2)
  check (funding_goal is null or funding_goal > 0);

with parsed_goals as (
  select
    p.id,
    replace(m.parts[1], ',', '')::numeric
      * case m.parts[3] when 'K' then 1000 when 'M' then 1000000 when 'B' then 1000000000 else 1 end
      as funding_goal
  from public.projects p
  cross join lateral (
    select regexp_match(
      upper(trim(p.goal)),
      '^\$?[[:space:]]*([0-9][0-9,]*([.][0-9]+)?)[[:space:]]*([KMB]?)$'
    ) as parts
  ) m
)
update public.projects p
set funding_goal = parsed_goals.funding_goal
from parsed_goals
where parsed_goals.id = p.id
  and parsed_goals.funding_goal > 0
  and parsed_goals.funding_goal <= 999999999999.99;

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  project_id text not null references public.projects (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  value numeric(14, 2) not null check (value >= 0),
  created_at timestamptz not null default now()
);

create index if not exists investments_user_created_idx
  on public.investments (user_id, created_at desc);
create index if not exists investments_project_idx
  on public.investments (project_id);

alter table public.investments enable row level security;
drop policy if exists "Users and admins can read investments" on public.investments;
create policy "Users and admins can read investments"
  on public.investments for select
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

revoke all on public.investments from public, anon, authenticated;
grant select on public.investments to authenticated;

drop policy if exists "Investors can read projects they hold" on public.projects;
create policy "Investors can read projects they hold"
  on public.projects for select
  to authenticated
  using (
    exists (
      select 1
      from public.investments i
      where i.project_id = projects.id
        and i.user_id = (select auth.uid())
    )
  );

create or replace function public.invest_in_project(p_project_id text, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_project public.projects%rowtype;
  v_balance numeric(14, 2);
  v_remaining numeric(14, 2);
  v_raised_pct numeric(5, 2);
  v_investment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to invest.';
  end if;
  if p_amount is null
     or p_amount::text = 'NaN'
     or p_amount <= 0
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a positive amount with no more than two decimal places.';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
  for update;
  if not found or v_profile.role <> 'client' or v_profile.is_super_admin then
    raise exception 'An investor account is required.';
  end if;
  if v_profile.account_status <> 'active' then
    raise exception 'This account is not active.';
  end if;
  if v_profile.kyc_status <> 'approved' then
    raise exception 'Complete identity verification before you invest.';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id
  for update;
  if not found then
    raise exception 'Project not found.';
  end if;
  if v_project.status <> 'Open' then
    raise exception 'This project is not open for investment.';
  end if;
  if p_amount < v_project.min_invest then
    raise exception 'Investment is below the project minimum of $' || v_project.min_invest::text || '.';
  end if;
  if v_project.funding_goal is null then
    raise exception 'This project does not have a valid funding goal configured.';
  end if;

  v_remaining := round(v_project.funding_goal * (100 - v_project.raised_pct) / 100, 2);
  if p_amount > v_remaining then
    raise exception 'Amount is more than the remaining project funding.';
  end if;

  select balance into v_balance
  from public.simulated_wallet_balances
  where user_id = auth.uid()
  for update;
  if not found or v_balance < p_amount then
    raise exception 'Amount is more than your available test balance.';
  end if;

  update public.simulated_wallet_balances
  set balance = balance - p_amount,
      updated_at = now()
  where user_id = auth.uid()
    and balance >= p_amount
  returning balance into v_balance;
  if not found then
    raise exception 'Amount is more than your available test balance.';
  end if;

  insert into public.investments (user_id, project_id, amount, value)
  values (auth.uid(), v_project.id, p_amount, p_amount)
  returning id into v_investment_id;

  v_raised_pct := round(v_project.raised_pct + (p_amount / v_project.funding_goal * 100), 2);
  if v_raised_pct >= 100 then
    update public.projects
    set raised_pct = 100,
        status = 'Funded',
        updated_at = now()
    where id = v_project.id;
  else
    update public.projects
    set raised_pct = v_raised_pct,
        updated_at = now()
    where id = v_project.id;
  end if;

  perform public.write_audit(
    'investment.created',
    'investment',
    v_investment_id::text,
    'Project: ' || v_project.name || '. Amount: $' || p_amount::text || '. Test balance after: $' || v_balance::text
  );
  return v_investment_id;
end;
$$;

revoke all on function public.invest_in_project(text, numeric) from public, anon;
grant execute on function public.invest_in_project(text, numeric) to authenticated;

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
  if p_change_pct is null or p_change_pct < -100 or p_change_pct > 100 then
    raise exception 'Enter a percentage between -100 and 100.';
  end if;
  if length(trim(coalesce(p_source_note, ''))) < 10 then
    raise exception 'Add a valuation source of at least 10 characters.';
  end if;

  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception 'Project not found.';
  end if;

  insert into public.project_valuations (project_id, change_pct, source_note, created_by)
  values (p_project_id, p_change_pct, trim(p_source_note), auth.uid());

  update public.projects
  set last_valuation = current_date::text,
      updated_at = now()
  where id = p_project_id;

  update public.investments
  set value = greatest(0, round(value * (1 + p_change_pct / 100), 2))
  where project_id = p_project_id;

  perform public.write_audit('project.valuation_posted', 'project', p_project_id, trim(p_source_note));
end;
$$;

revoke all on function public.admin_post_project_valuation(text, numeric, text) from public, anon;
grant execute on function public.admin_post_project_valuation(text, numeric, text) to authenticated;