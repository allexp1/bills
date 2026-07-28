-- Sub-national playbooks: the key becomes (country, region, utility).
--
-- NOT run by `drizzle-kit migrate`. meta/_journal.json lists only 0000, so
-- this is applied by hand, same as 0004, 0005 and 0006.
--
-- '' means the country-level playbook, which is what every existing row is —
-- hence the default, which backfills the 90 researched markets correctly
-- without a data migration. A region row is researched only where the
-- country-level answer is WRONG: US electricity is a regulated regional
-- monopoly in most states and a competitive retail-choice market in Texas,
-- Pennsylvania, Ohio and a dozen others, and one boolean cannot be right for
-- both. Everywhere else the country row is already correct and lookup falls
-- back to it, so we never pay to research fifty states.

alter table "utility_playbooks" add column if not exists "region" text not null default '';

drop index if exists "utility_playbooks_key_idx";
create unique index if not exists "utility_playbooks_key_idx"
  on "utility_playbooks" ("country", "region", "utility");

-- Recorded here rather than in its own file: RLS was turned on for this table
-- out of band, BEFORE 0006_tenant_rls. Repeated because the pairing is the
-- part worth not losing — `enable row level security` on its own denies by
-- default and locks bills_app out of its own table, so the permissive policy
-- is not optional. utility_playbooks is deliberately global (no customer
-- linkage, shared across tenants), so it gets no bills_tenant policy.
alter table "utility_playbooks" enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'utility_playbooks' and policyname = 'bills_app_all_utility_playbooks'
  ) then
    create policy "bills_app_all_utility_playbooks"
      on "utility_playbooks" for all to "bills_app" using (true) with check (true);
  end if;
end $$;

grant select, insert, update, delete on "utility_playbooks" to "bills_app";
