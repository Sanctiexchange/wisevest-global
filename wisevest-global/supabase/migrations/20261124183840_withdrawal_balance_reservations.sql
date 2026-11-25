alter table public.withdrawal_requests
  add column if not exists balance_debited boolean not null default false;

create or replace function public.submit_withdrawal_request(
  p_amount numeric,
  p_method text,
  p_destination text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_balance numeric(14, 2);
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'An active signed-in account is required.';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enroll in and verify Supabase multi-factor authentication before requesting a withdrawal.';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
  for update;
  if not found or v_profile.account_status <> 'active' then
    raise exception 'An active signed-in account is required.';
  end if;
  if v_profile.role <> 'client' or v_profile.is_super_admin then
    raise exception 'A client account is required to request a withdrawal.';
  end if;
  if v_profile.kyc_status <> 'approved' then
    raise exception 'Complete identity verification before requesting a withdrawal.';
  end if;

  if p_amount is null
     or p_amount::text = 'NaN'
     or p_amount < 50
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a withdrawal amount of at least $50 with no more than two decimal places.';
  end if;
  if p_method is null or p_method not in ('BTC', 'USDT', 'USDC', 'Bank') then
    raise exception 'Choose a valid withdrawal method.';
  end if;
  if length(trim(coalesce(p_destination, ''))) < 8 then
    raise exception 'Enter a valid destination.';
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

  insert into public.withdrawal_requests (user_id, amount, method, destination, balance_debited)
  values (auth.uid(), p_amount, p_method, trim(p_destination), true)
  returning id into v_id;

  perform public.write_audit(
    'withdrawal.requested',
    'withdrawal_request',
    v_id::text,
    'Amount: $' || p_amount::text || '. Available test balance after request: $' || v_balance::text
  );
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
  v_balance numeric(14, 2);
  v_next_status text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Choose approve or reject.';
  end if;
  if p_decision = 'reject' and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters.';
  end if;

  select * into v_request
  from public.withdrawal_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'Withdrawal request not found.';
  end if;
  if v_request.status not in ('pending', 'awaiting_second') then
    raise exception 'This request has already been reviewed.';
  end if;
  if p_decision = 'approve' and not v_request.balance_debited then
    raise exception 'This older request must be reconciled before it can be approved.';
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

  if v_next_status = 'rejected' and v_request.balance_debited then
    update public.simulated_wallet_balances
    set balance = balance + v_request.amount,
        updated_at = now()
    where user_id = v_request.user_id
    returning balance into v_balance;
    if not found then
      raise exception 'Could not return the reserved amount to the available test balance.';
    end if;

    update public.withdrawal_requests
    set balance_debited = false
    where id = p_request_id;
  end if;

  perform public.write_audit(
    'withdrawal.' || v_next_status,
    'withdrawal_request',
    p_request_id::text,
    case
      when v_next_status = 'awaiting_second' then 'First approval; second approval required.'
      when v_next_status = 'rejected' and v_request.balance_debited then
        coalesce(p_reason, '') || ' Reserved test balance refunded: $' || v_request.amount::text || '.'
      else coalesce(p_reason, '')
    end
  );
  return v_next_status;
end;
$$;

revoke all on function public.admin_review_withdrawal(uuid, text, text) from public, anon;
grant execute on function public.admin_review_withdrawal(uuid, text, text) to authenticated;