create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create table if not exists public.projects (
  id text primary key,
  name text not null,
  category text not null check (category in ('Bitcoin', 'Energy', 'Real estate')),
  icon text not null,
  risk text not null check (risk in ('High', 'Medium', 'Low–Medium')),
  min_invest numeric(14, 2) not null check (min_invest > 0),
  term text not null,
  target_return text not null,
  raised_pct numeric(5, 2) not null default 0 check (raised_pct between 0 and 100),
  goal text not null,
  fees text not null,
  exit_terms text not null,
  description text not null,
  risks jsonb not null default '[]'::jsonb check (jsonb_typeof(risks) = 'array'),
  status text not null default 'Draft' check (status in ('Draft', 'Open', 'Funded', 'Closed')),
  last_valuation text not null default 'Not yet valued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "Anyone can read investable projects" on public.projects;
create policy "Anyone can read investable projects"
  on public.projects for select
  to anon, authenticated
  using (status in ('Open', 'Funded'));

grant select on public.projects to anon, authenticated;

insert into public.projects (
  id, name, category, icon, risk, min_invest, term, target_return, raised_pct, goal,
  fees, exit_terms, description, risks, status, last_valuation
) values
  ('btc-a', 'Bitcoin Strategy Fund A', 'Bitcoin', '₿', 'High', 100, '12 months', '10–25% (target)', 68, '$2.0M',
   '2% management, 10% performance', 'Quarterly redemption windows, 30-day notice',
   'A company-managed strategy combining Bitcoin holdings with a rules-based allocation. Value moves closely with Bitcoin and can fall sharply.',
   '[{"title":"Price volatility","text":"Bitcoin can lose a large share of its value in a short period."},{"title":"Custody and security","text":"Assets are held with third-party custodians and carry cyber and operational risk."},{"title":"Liquidity","text":"Redemptions are only available in set windows."}]',
   'Open', '2026-10-01'),
  ('btc-m', 'Bitcoin Mining Partnership', 'Bitcoin', '⛏', 'High', 500, '24 months', '12–30% (target)', 41, '$1.5M',
   '1.5% management, 15% performance', 'Held to term; secondary transfer subject to approval',
   'Participation in a managed mining operation. Returns depend on Bitcoin price, network difficulty, hardware performance and power costs.',
   '[{"title":"Price and difficulty","text":"Lower prices or higher difficulty can erase margins."},{"title":"Hardware and power","text":"Equipment failure or energy cost rises reduce output."},{"title":"Regulation","text":"Mining rules vary and may change."}]',
   'Open', '2026-09-20'),
  ('solar', 'Solar Energy Project', 'Energy', '☀', 'Medium', 250, '24 months', '8–14% (target)', 82, '$3.2M',
   '1.5% management', 'Held to term; early exit at company discretion with fee',
   'Development and operation of a solar generation site with a planned power purchase agreement. Returns depend on construction, output and offtake.',
   '[{"title":"Construction delay","text":"Delays push back income and can raise costs."},{"title":"Offtake and pricing","text":"Revenue depends on the power purchase agreement being honoured."},{"title":"Regulatory and grid access","text":"Permits and grid connection may change."}]',
   'Open', '2026-09-15'),
  ('grid', 'Community Power Grid', 'Energy', '⚡', 'Medium', 500, '36 months', '9–15% (target)', 27, '$4.0M',
   '1.75% management', 'Held to term',
   'Build-out of a distributed mini-grid serving businesses and households under metered contracts.',
   '[{"title":"Collection risk","text":"Customer payment shortfalls reduce income."},{"title":"Asset risk","text":"Equipment damage or theft can interrupt revenue."},{"title":"Currency","text":"Local-currency revenue can lose value against the dollar."}]',
   'Open', '2026-09-01'),
  ('resi', 'Residential Development', 'Real estate', '🏢', 'Medium', 1000, '36 months', '10–18% (target)', 55, '$5.0M',
   '2% management, 10% on profit', 'Held to term; sale of units distributes proceeds',
   'Construction and sale of residential units on titled land, with independent valuation and staged build milestones.',
   '[{"title":"Construction and cost overruns","text":"Budget or schedule slips reduce profit."},{"title":"Sales market","text":"Units may sell slower or for less than planned."},{"title":"Title and permits","text":"Legal or planning issues can halt the project."}]',
   'Open', '2026-10-10'),
  ('rent', 'Income Property Portfolio', 'Real estate', '🏠', 'Low–Medium', 500, '48 months', '6–10% (target)', 90, '$2.5M',
   '1.25% management', 'Annual redemption window, subject to liquidity',
   'A portfolio of rental properties generating income, with periodic independent valuations.',
   '[{"title":"Vacancy","text":"Empty units reduce rental income."},{"title":"Valuation","text":"Property values can fall and valuations are estimates."},{"title":"Liquidity","text":"Property is hard to sell quickly."}]',
   'Open', '2026-10-05')
on conflict (id) do nothing;
