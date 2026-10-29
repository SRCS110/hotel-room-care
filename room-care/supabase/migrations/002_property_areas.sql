-- Run this ONCE in Supabase > SQL Editor if you already ran schema.sql before Oct 29.
-- Adds property areas (lobby, elevator, parking...) so tickets can be filed outside guest rooms.
-- Safe to re-run.

alter table rooms add column if not exists kind text not null default 'room';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_kind_check') then
    alter table rooms add constraint rooms_kind_check check (kind in ('room','area'));
  end if;
end $$;

-- Areas use floor 0. Rename, add or remove rows in Table Editor > rooms (kind = 'area') to match each hotel.
insert into rooms (property_id, number, floor, kind)
select p.id, a.name, 0, 'area'
from properties p
cross join (values
  ('Lobby'), ('Front desk'), ('Elevator'), ('Hallways'), ('Stairwells'), ('Exterior & entrance'),
  ('Parking'), ('Laundry room'), ('Back of house'), ('Other area')
) as a(name)
on conflict (property_id, number) do nothing;

-- Keep the public roles locked out (same as schema.sql)
revoke all on all tables in schema public from anon, authenticated;
