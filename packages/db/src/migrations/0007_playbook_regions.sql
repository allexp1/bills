-- Sub-national playbooks: key becomes (country, region, utility).
--
-- '' means the country-level playbook, which is what every existing row is —
-- hence the default, which backfills them correctly without a data migration.
-- A region row is researched only where the country-level answer is WRONG
-- (US electricity: regional monopoly in most states, competitive retail in
-- Texas, Pennsylvania, Ohio…); everywhere else the country row is already
-- right and lookup falls back to it, so we never pay to research 50 states.
alter table "utility_playbooks" add column if not exists "region" text not null default '';

drop index if exists "utility_playbooks_key_idx";
create unique index if not exists "utility_playbooks_key_idx"
  on "utility_playbooks" ("country", "region", "utility");
