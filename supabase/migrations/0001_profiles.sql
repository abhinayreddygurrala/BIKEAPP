-- Profiles: one row per auth user, auto-created on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  units text not null default 'metric' check (units in ('metric', 'imperial')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
