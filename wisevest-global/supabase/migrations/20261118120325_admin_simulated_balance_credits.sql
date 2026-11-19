create table if not exists public.simulated_wallet_balances (
  user_id uuid primary key references public.profiles (id) on delete restrict,
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulated_balance_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  balance_after numeric(14, 2) not null check (balance_after >= amount),
  reason text not null check (length(trim(reason)) between 5 and 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists simulated_balance_credits_user_created_idx
  on public.simulated_balance_credits (user_id, created_at desc);

alter table public.simulated_wallet_balances enable row level security;
alter table public.simulated_balance_credits enable row level security;

drop policy if exists "Users and admins can read simulated wallet balances" on public.simulated_wallet_balances;
create policy "Users and admins can read simulated wallet balances"
  on public.simulated_wallet_balances for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users and admins can read simulated balance credits" on public.simulated_balance_credits;
create policy "Users and admins can read simulated balance credits"
  on public.simulated_balance_credits for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

revoke all on public.simulated_wallet_balances from public, anon, authenticated;
revoke all on public.simulated_balance_credits from public, anon, authenticated;
grant select on public.simulated_wallet_balances, public.simulated_balance_credits to authenticated;

create or replace function public.admin_simulate_balance_credit(
  p_user_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_balance numeric(14, 2);
  v_credit_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_user_id is null then
    raise exception 'Choose a client account.';
  end if;
  if p_amount is null
     or p_amount::text = 'NaN'
     or p_amount <= 0
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a positive amount with no more than two decimal places.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 or length(trim(p_reason)) > 500 then
    raise exception 'Give a reason between 5 and 500 characters.';
  end if;

  select p.account_status into v_account_status
  from public.profiles p
  where p.id = p_user_id and p.role = 'client' and not p.is_super_admin
  for update;
  if not found then
    raise exception 'Client account not found.';
  end if;
  if v_account_status <> 'active' then
    raise exception 'Reactivate this account before adding a simulated credit.';
  end if;

  insert into public.simulated_wallet_balances (user_id, balance)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
    set balance = simulated_wallet_balances.balance + excluded.balance,
        updated_at = now()
  returning balance into v_balance;

  insert into public.simulated_balance_credits (user_id, amount, balance_after, reason, created_by)
  values (p_user_id, p_amount, v_balance, trim(p_reason), auth.uid())
  returning id into v_credit_id;

  perform public.write_audit(
    'balance.simulated_credit',
    'profile',
    p_user_id::text,
    'Amount: $' || p_amount::text || '. ' || trim(p_reason)
  );
  return v_credit_id;
end;
$$;

revoke all on function public.admin_simulate_balance_credit(uuid, numeric, text) from public, anon;
grant execute on function public.admin_simulate_balance_credit(uuid, numeric, text) to authenticated;