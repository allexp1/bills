-- Row-level security on utility_playbooks.
--
-- NOTE the second statement: enabling RLS without a policy locks the
-- application role out entirely (RLS denies by default). The app connects as
-- a single trusted role and does its own authorization in code, so the
-- correct pairing here is "RLS on + one permissive policy for bills_app",
-- matching every other table in this database.
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
