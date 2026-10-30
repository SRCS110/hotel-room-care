-- Run ONCE in Supabase > SQL Editor if you installed before Oct 30.
-- Replaces the maintenance-style checklist with the turnover inspection.
-- Old items are retired (active = false), not deleted, so past inspections keep their history. Safe to re-run.

drop table if exists new_items;
create temporary table new_items (grp text, label text, sort int);
insert into new_items values
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
  ('Damage','No odor or smoking signs',430);

update checklist_items set active = false
where label not in (select label from new_items);

update checklist_items c set grp = n.grp, sort = n.sort, active = true
from new_items n where c.label = n.label;

insert into checklist_items (grp, label, sort)
select n.grp, n.label, n.sort from new_items n
where not exists (select 1 from checklist_items c where c.label = n.label);

drop table if exists new_items;
