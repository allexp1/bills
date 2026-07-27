-- Turn utility_playbooks into a work queue as well as a cache: a row can be
-- enqueued (status='pending', data null) and drained by the warming cron.
alter table "utility_playbooks" alter column "data" drop not null;
alter table "utility_playbooks" add column if not exists "priority" integer not null default 100;
alter table "utility_playbooks" add column if not exists "last_error" text;
alter table "utility_playbooks" add column if not exists "attempts" integer not null default 0;

create index if not exists "utility_playbooks_pending_idx"
  on "utility_playbooks" ("status", "priority");
