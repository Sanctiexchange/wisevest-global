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
      'Simulated credit for verified ' || v_request.method || ' deposit ' || v_request.id::text
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