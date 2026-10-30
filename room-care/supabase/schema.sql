-- Room Care · Stay Santa Rosa staff portal
-- Run this whole file once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run on an empty project. It does NOT drop anything.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table if not exists properties (
  id         text primary key,              -- 'hotele', 'arthouse'
  name       text not null,
  prefix     text not null,                 -- ticket code prefix, e.g. HE-1042
  per_floor  int  not null                  -- rooms per floor (floors 2-4)
);

create table if not exists rooms (
  id          bigserial primary key,
  property_id text not null references properties(id),
  number      text not null,                -- room number, or the area name for property areas
  floor       int  not null,                -- 0 for property areas
  kind        text not null default 'room' check (kind in ('room','area')),
  unique (property_id, number)
);

create table if not exists staff (
  id              bigserial primary key,
  property_id     text not null references properties(id),
  name            text not null,
  portal          text not null check (portal in ('frontdesk','housekeeping','maintenance','manager')),
  pin_hash        text not null,            -- bcrypt hash, never the PIN itself
  active          boolean not null default true,
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  created_by      bigint references staff(id),
  created_at      timestamptz not null default now(),
  unique (property_id, portal, name)
);

create table if not exists checklist_items (
  id     bigserial primary key,
  grp    text not null,
  label  text not null,
  sort   int  not null default 0,
  active boolean not null default true
);

create table if not exists inspections (
  id           bigserial primary key,
  room_id      bigint not null references rooms(id),
  staff_id     bigint references staff(id),
  completed_at timestamptz not null default now(),
  fail_count   int not null default 0
);

create table if not exists inspection_results (
  inspection_id bigint not null references inspections(id) on delete cascade,
  item_id       bigint not null references checklist_items(id),
  result        text not null check (result in ('pass','fail','na')),
  note          text,
  primary key (inspection_id, item_id)
);

create table if not exists tickets (
  id            bigserial primary key,
  room_id       bigint not null references rooms(id),
  department    text not null check (department in ('maintenance','housekeeping')),
  title         text not null,
  body          text not null,
  category      text not null default 'Other',
  priority      text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  status        text not null default 'Open'   check (status in ('Open','In progress','On hold','Done')),
  out_of_order  boolean not null default false,
  reported_by   bigint references staff(id),
  assigned_to   bigint references staff(id),
  inspection_id bigint references inspections(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz
);

create table if not exists ticket_comments (
  id             bigserial primary key,
  ticket_id      bigint not null references tickets(id) on delete cascade,
  staff_id       bigint references staff(id),
  body           text,
  change_summary text,
  created_at     timestamptz not null default now()
);

create table if not exists activity_log (
  id            bigserial primary key,
  room_id       bigint not null references rooms(id),
  kind          text not null check (kind in ('inspection','open','update','comment','close')),
  department    text,
  staff_id      bigint references staff(id),
  ticket_id     bigint references tickets(id) on delete set null,
  inspection_id bigint references inspections(id) on delete set null,
  summary       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists tickets_room_idx      on tickets(room_id);
create index if not exists tickets_status_idx    on tickets(status, department);
create index if not exists comments_ticket_idx   on ticket_comments(ticket_id);
create index if not exists inspections_room_idx  on inspections(room_id, completed_at desc);
create index if not exists log_room_idx          on activity_log(room_id, created_at desc);

-- ---------------------------------------------------------------
-- Row level security: disabled on every table, per requirement.
-- Access is controlled instead by (1) the app server holding the only key
-- and (2) removing the public roles' table access below.
-- ---------------------------------------------------------------
alter table properties         disable row level security;
alter table rooms              disable row level security;
alter table staff              disable row level security;
alter table checklist_items    disable row level security;
alter table inspections        disable row level security;
alter table inspection_results disable row level security;
alter table tickets            disable row level security;
alter table ticket_comments    disable row level security;
alter table activity_log       disable row level security;

-- Close the public door: the browser-facing "anon" key and signed-in
-- "authenticated" role get no access to these tables at all.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- The app server uses the service_role key.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------
insert into properties (id, name, prefix, per_floor) values
  ('hotele',   'Hotel E',   'HE', 13),
  ('arthouse', 'Art House', 'AH', 12)
on conflict (id) do nothing;

-- Rooms: floors 2-4. Hotel E x01-x13, Art House x01-x12.
insert into rooms (property_id, number, floor)
select p.id, (f * 100 + n)::text, f
from properties p
cross join generate_series(2, 4) as f
cross join lateral generate_series(1, p.per_floor) as n
on conflict (property_id, number) do nothing;

-- Property areas for tickets outside guest rooms (edit in Table Editor > rooms, kind = 'area')
insert into rooms (property_id, number, floor, kind)
select p.id, a.name, 0, 'area'
from properties p
cross join (values
  ('Lobby'), ('Front desk'), ('Elevator'), ('Hallways'), ('Stairwells'), ('Exterior & entrance'),
  ('Parking'), ('Laundry room'), ('Back of house'), ('Other area')
) as a(name)
on conflict (property_id, number) do nothing;

-- Turnover inspection checklist (edit freely later; set active=false to retire an item)
insert into checklist_items (grp, label, sort)
select * from (values
  ('Linens & amenities','Robes (2) present',10),
  ('Linens & amenities','Extra blanket present',20),
  ('Linens & amenities','Pillows present (full count)',30),
  ('Linens & amenities','Towels: full set',40),
  ('Linens & amenities','Hangers present',50),
  ('Linens & amenities','Hair dryer present',60),
  ('Linens & amenities','Iron & ironing board present',70),
  ('Linens & amenities','Coffee maker, pods & cups stocked',80),
  ('Linens & amenities','Toiletries stocked',90),
  ('Linens & amenities','TV remote present',100),
  ('Works & present','TV turns on, remote works',210),
  ('Works & present','Lamps present, working, not broken',220),
  ('Works & present','Phone & clock present',230),
  ('Works & present','Mini fridge empty & clean',240),
  ('Works & present','Heat / AC runs',250),
  ('Clean','Bed made, linens fresh',310),
  ('Clean','Drapes & sheers clean',320),
  ('Clean','Carpet clean, no stains',330),
  ('Clean','Hard floors clean',340),
  ('Clean','Furniture clean & dusted',350),
  ('Clean','Bathroom clean (toilet, sink, tub/shower)',360),
  ('Clean','Mirrors & glass clean',370),
  ('Clean','Trash emptied',380),
  ('Damage','No room damage (walls, doors, ceiling)',410),
  ('Damage','No furniture damage',420),
  ('Damage','No odor or smoking signs',430)
) as v(grp, label, sort)
where not exists (select 1 from checklist_items);

-- First manager login at each hotel. CHANGE THE NAME AND PIN BELOW before running,
-- then add everyone else from the Manager > Staff tab in the app.
insert into staff (property_id, name, portal, pin_hash)
select p.id, 'Daniel W.', 'manager', extensions.crypt('2580', extensions.gen_salt('bf', 10))
from properties p
on conflict (property_id, portal, name) do nothing;
