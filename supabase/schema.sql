-- ============================================================================
-- Equipe Fantasma — Schema Supabase (banco real, compartilhado entre todos)
-- Rode isto no SQL Editor do seu projeto Supabase (Database > SQL Editor > New query)
-- ============================================================================

-- 1) Perfis (role admin/user), ligados 1:1 com auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

-- 2) Histórico de login
create table if not exists public.logins (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  username text not null,
  success boolean not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 3) Atividades / pesquisas realizadas
create table if not exists public.activities (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  username text not null,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- 4) Sessões online (heartbeat)
create table if not exists public.sessions_online (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  last_seen timestamptz not null default now()
);

-- ============================================================================
-- Função auxiliar: sou admin?
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================================
-- RLS (Row Level Security) — cada tabela só é acessível conforme a regra
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.logins enable row level security;
alter table public.activities enable row level security;
alter table public.sessions_online enable row level security;

-- profiles: usuário vê o próprio perfil; admin vê todos
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- profiles: só admin pode atualizar role de outros (criação/remoção fica nas Edge Functions)
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

-- logins: usuário insere só a própria linha; admin lê tudo
drop policy if exists "logins_insert_own" on public.logins;
create policy "logins_insert_own" on public.logins
  for insert with check (user_id = auth.uid() or user_id is null);

drop policy if exists "logins_select_admin" on public.logins;
create policy "logins_select_admin" on public.logins
  for select using (public.is_admin());

-- activities: usuário insere e lê a própria; admin lê tudo
drop policy if exists "activities_insert_own" on public.activities;
create policy "activities_insert_own" on public.activities
  for insert with check (user_id = auth.uid());

drop policy if exists "activities_select_own_or_admin" on public.activities;
create policy "activities_select_own_or_admin" on public.activities
  for select using (user_id = auth.uid() or public.is_admin());

-- sessions_online: usuário atualiza a própria; todos autenticados podem ver quem está online; admin também
drop policy if exists "sessions_upsert_own" on public.sessions_online;
create policy "sessions_upsert_own" on public.sessions_online
  for insert with check (user_id = auth.uid());

drop policy if exists "sessions_update_own" on public.sessions_online;
create policy "sessions_update_own" on public.sessions_online
  for update using (user_id = auth.uid());

drop policy if exists "sessions_select_admin" on public.sessions_online;
create policy "sessions_select_admin" on public.sessions_online
  for select using (public.is_admin());

-- ============================================================================
-- Trigger: ao criar um usuário no Auth (via Edge Function admin-create-user),
-- cria automaticamente a linha em profiles usando os metadados enviados.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Admin padrão: crie manualmente depois de rodar este script, indo em
-- Authentication > Users > Add user no painel do Supabase, com:
--   email: admin@equipefantasma.local
--   password: (defina uma senha forte sua)
-- Depois rode este UPDATE para garantir o papel admin:
--   update public.profiles set role = 'admin' where username = 'admin';
-- ============================================================================
