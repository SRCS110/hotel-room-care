-- Run ONCE in Supabase > SQL Editor if you installed before Oct 30. Safe to re-run.
-- Keeps full turnover sheets for reference, limited to the latest 3 per room.

-- Let old inspections be removed without touching tickets that came from them.
alter table tickets drop constraint if exists tickets_inspection_id_fkey;
alter table tickets add constraint tickets_inspection_id_fkey
  foreign key (inspection_id) references inspections(id) on delete set null;

-- One-time cleanup: keep only the latest 3 inspections per room.
with ranked as (
  select id, row_number() over (partition by room_id order by completed_at desc, id desc) as rn
  from inspections
), old as (select id from ranked where rn > 3)
delete from activity_log where inspection_id in (select id from old);

with ranked as (
  select id, row_number() over (partition by room_id order by completed_at desc, id desc) as rn
  from inspections
)
delete from inspections where id in (select id from ranked where rn > 3);
