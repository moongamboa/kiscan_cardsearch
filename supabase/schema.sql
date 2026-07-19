-- ============================================================
-- KiScan · Esquema de base de datos (Supabase / Postgres)
-- ============================================================
-- Cómo usar: Supabase Dashboard -> SQL Editor -> pega este archivo -> Run.
-- Se puede ejecutar varias veces sin romper nada (usa IF NOT EXISTS).

-- 1) PERFILES ---------------------------------------------------
-- Cada usuario de auth.users (lo crea Supabase Auth automáticamente)
-- tiene una fila espejo aquí con datos propios de la app.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  country text,               -- 'ES','FR','US','MX','ONLINE'...
  created_at timestamptz default now()
);

-- Crea el perfil automáticamente cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) COLECCIÓN ---------------------------------------------------
-- Las cartas que el usuario dice que posee.
create table if not exists public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  game text not null,              -- 'magic' | 'pokemon' | 'onepiece' | 'dbs'
  card_name text not null,
  card_code text,                  -- ej. 'BT20-060'
  price_paid numeric(10,2),
  currency text default 'EUR',
  image_url text,
  added_at timestamptz default now()
);

-- 3) WISHLIST / ALERTAS DE PRECIO --------------------------------
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  game text not null,
  card_name text not null,
  target_price numeric(10,2) not null,
  currency text default 'EUR',
  active boolean default true,
  created_at timestamptz default now()
);

-- 4) EVENTOS -------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  city text not null,
  country text not null,           -- 'ES','FR','US','MX','ONLINE'
  event_date date not null,
  event_type text not null,        -- 'locals'|'regional'|'national'|'online'
  format text not null,            -- 'Estándar'|'Sealed'|'Draft'
  created_at timestamptz default now()
);

create table if not exists public.event_attendees (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (event_id, user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Sin esto, CUALQUIERA con tu API key pública podría leer/escribir
-- los datos de otros usuarios. Es el paso de seguridad más importante.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.collection_items enable row level security;
alter table public.price_alerts enable row level security;
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;

-- Perfiles: todos pueden leer (para mostrar nombre en eventos), solo el dueño edita
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- Colección: 100% privada, solo el dueño la ve o la toca
drop policy if exists "collection_owner_all" on public.collection_items;
create policy "collection_owner_all" on public.collection_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Alertas: 100% privadas
drop policy if exists "alerts_owner_all" on public.price_alerts;
create policy "alerts_owner_all" on public.price_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Eventos: cualquiera (incluso sin login) puede VER; solo usuarios logueados publican;
-- solo el creador puede editar/borrar su propio evento.
drop policy if exists "events_select_public" on public.events;
create policy "events_select_public" on public.events for select using (true);
drop policy if exists "events_insert_auth" on public.events;
create policy "events_insert_auth" on public.events for insert with check (auth.uid() = creator_id);
drop policy if exists "events_modify_owner" on public.events;
create policy "events_modify_owner" on public.events for update using (auth.uid() = creator_id);
drop policy if exists "events_delete_owner" on public.events;
create policy "events_delete_owner" on public.events for delete using (auth.uid() = creator_id);

-- Asistentes: cualquiera ve quién va; solo tú te apuntas/desapuntas a ti mismo
drop policy if exists "attendees_select_public" on public.event_attendees;
create policy "attendees_select_public" on public.event_attendees for select using (true);
drop policy if exists "attendees_join_self" on public.event_attendees;
create policy "attendees_join_self" on public.event_attendees for insert with check (auth.uid() = user_id);
drop policy if exists "attendees_leave_self" on public.event_attendees;
create policy "attendees_leave_self" on public.event_attendees for delete using (auth.uid() = user_id);

-- Índices útiles
create index if not exists idx_collection_user on public.collection_items(user_id);
create index if not exists idx_alerts_user on public.price_alerts(user_id);
create index if not exists idx_events_date on public.events(event_date);
create index if not exists idx_events_country on public.events(country);

-- ============================================================
-- 5) RANKING DE CARTAS MÁS BUSCADAS
-- ============================================================
create table if not exists public.search_stats (
  game text not null,
  card_name text not null,
  count integer not null default 0,
  last_searched_at timestamptz default now(),
  primary key (game, card_name)
);

alter table public.search_stats enable row level security;

-- Todo el mundo puede LEER el ranking (para mostrarlo en "Tendencias")
drop policy if exists "search_stats_select_all" on public.search_stats;
create policy "search_stats_select_all" on public.search_stats for select using (true);
-- Nadie escribe directo desde el navegador: solo la función de servidor
-- /api/log-search (que usa la service_role key) puede sumar búsquedas.
-- Así nadie puede "hacer trampa" inflando el contador desde la consola del navegador.

create index if not exists idx_search_stats_count on public.search_stats(game, count desc);

-- Función que suma 1 búsqueda de forma atómica (evita condiciones de carrera
-- si dos personas buscan la misma carta al mismo tiempo).
create or replace function public.increment_search(p_game text, p_card_name text)
returns void as $$
begin
  insert into public.search_stats (game, card_name, count, last_searched_at)
  values (p_game, p_card_name, 1, now())
  on conflict (game, card_name)
  do update set count = public.search_stats.count + 1, last_searched_at = now();
end;
$$ language plpgsql security definer;
