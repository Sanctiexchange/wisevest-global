update public.audit_events
set action = regexp_replace(action, 'simulated', 'test', 'gi'),
    reason = regexp_replace(reason, 'simulated', 'test', 'gi')
where action ilike '%simulated%' or reason ilike '%simulated%';

update public.simulated_balance_credits
set reason = regexp_replace(reason, 'simulated', 'test', 'gi')
where reason ilike '%simulated%';

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
    raise exception 'Reactivate this account before adding a test credit.';
  end if;

  insert into public.simulated_wallet_balances (user_id, balance)
  values (p_user_id, p_amount)
  on conflict (user_id) do update
    set balance = simulated_wallet_balances.balance + excluded.balance,
        updated_at = now()
  returning balance into v_balance;

  insert into public.simulated_balance_credits (user_id, amount, balance_after, reason, created_by)
  values (
    p_user_id,
    p_amount,
    v_balance,
    regexp_replace(trim(p_reason), 'simulated', 'test', 'gi'),
    auth.uid()
  )
  returning id into v_credit_id;

  perform public.write_audit(
    'balance.test_credit',
    'profile',
    p_user_id::text,
    'Amount: $' || p_amount::text || '. ' || regexp_replace(trim(p_reason), 'simulated', 'test', 'gi')
  );
  return v_credit_id;
end;
$$;

revoke all on function public.admin_simulate_balance_credit(uuid, numeric, text) from public, anon;
grant execute on function public.admin_simulate_balance_credit(uuid, numeric, text) to authenticated;

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
  if p_decision is null or p_decision not in ('verified', 'rejected') then
    raise exception 'Choose verify or reject.';
  end if;
  if p_decision = 'rejected' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters.';
  end if;

  select * into v_request
  from public.deposit_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Deposit request not found.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been reviewed.';
  end if;

  if p_decision = 'verified' then
    perform public.admin_simulate_balance_credit(
      v_request.user_id,
      v_request.amount,
      'Test credit for verified ' || v_request.method || ' deposit ' || v_request.id::text
    );
  end if;

  update public.deposit_requests
  set status = p_decision,
      review_reason = nullif(trim(coalesce(p_reason, '')), ''),
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_request_id;

  perform public.write_audit(
    'deposit.' || p_decision,
    'deposit_request',
    p_request_id::text,
    coalesce(p_reason, '')
  );
end;
$$;

revoke all on function public.admin_review_deposit(uuid, text, text) from public, anon;
grant execute on function public.admin_review_deposit(uuid, text, text) to authenticated;