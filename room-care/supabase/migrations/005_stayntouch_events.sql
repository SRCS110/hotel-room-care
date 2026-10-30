-- Run ONCE in Supabase > SQL Editor. Safe to re-run.
-- Raw inbox for Stayntouch webhook messages (read-only capture; nothing is sent back to Stayntouch).
create table if not exists stayntouch_events (
  id          bigserial primary key,
  received_at timestamptz not null default now(),
  verified    boolean not null default false,   -- signature matched STAYNTOUCH_WEBHOOK_SECRET
  event       text,                             -- event name if the message includes one
  headers     jsonb,
  payload     jsonb
);
create index if not exists stayntouch_events_received_idx on stayntouch_events(received_at desc);
alter table stayntouch_events disable row level security;
revoke all on stayntouch_events from anon, authenticated;
revoke all on sequence stayntouch_events_id_seq from anon, authenticated;
grant all on stayntouch_events to service_role;
grant all on sequence stayntouch_events_id_seq to service_role;
