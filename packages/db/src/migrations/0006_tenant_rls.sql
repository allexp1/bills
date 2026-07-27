-- Multi-tenancy: web accounts on top of the existing customer rows, plus row
-- level security as the second of two isolation layers.
--
-- Identity note. Customers already exist, keyed by WhatsApp id. Clerk becomes
-- the web login and is linked onto that same row rather than replacing it, so
-- someone who has been sending bills over WhatsApp for months signs in and
-- finds their history already there. Linking is by VERIFIED phone only: Clerk
-- proves ownership of the number and wa_hash is the same hash of the same
-- number, so the join is safe. An email-only signup gets a fresh customer row
-- and links later, if and when a phone is verified.

alter table customers add column if not exists clerk_user_id text;
alter table customers add column if not exists email text;
alter table customers add column if not exists linked_at timestamptz;

create unique index if not exists customers_clerk_user_id_key
  on customers (clerk_user_id) where clerk_user_id is not null;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Policies read current_setting('app.customer_id'), which withTenant sets for
-- the duration of one transaction. The second argument is missing_ok, so an
-- unset value yields NULL rather than raising, and NULL compares false against
-- every id. A query that reaches the database without tenant context therefore
-- returns nothing, instead of returning everything.
--
-- FORCE matters here: without it the policies are skipped for the table owner,
-- which is exactly who the application connects as today.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bills_admin') then
    create role bills_admin;
  end if;
end
$$;

-- Tables owning customer_id directly.
do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'conversations', 'authorizations', 'missions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (customer_id = current_setting(''app.customer_id'', true)) with check (customer_id = current_setting(''app.customer_id'', true))',
      t);
  end loop;
end
$$;

-- customers is keyed by id, not customer_id.
alter table customers enable row level security;
alter table customers force row level security;
drop policy if exists tenant_isolation on customers;
create policy tenant_isolation on customers
  using (id = current_setting('app.customer_id', true))
  with check (id = current_setting('app.customer_id', true));

-- extractions and decodes reach the tenant through their invoice.
do $$
declare
  t text;
begin
  foreach t in array array['extractions', 'decodes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (exists (select 1 from invoices i where i.id = %I.invoice_id and i.customer_id = current_setting(''app.customer_id'', true)))',
      t, t);
  end loop;
end
$$;

-- messages reach the tenant through their conversation.
alter table messages enable row level security;
alter table messages force row level security;
drop policy if exists tenant_isolation on messages;
create policy tenant_isolation on messages
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and c.customer_id = current_setting('app.customer_id', true)
  ));

-- Background work runs as bills_admin through withoutTenant: cron purges,
-- playbook warming, and webhook ingestion that happens before a customer has
-- been resolved. Nothing reachable from a signed-in request may use it.
grant bills_admin to current_user;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'invoices', 'extractions', 'decodes', 'conversations', 'messages', 'authorizations', 'missions']
  loop
    execute format('grant all on table %I to bills_admin', t);
    execute format('drop policy if exists admin_bypass on %I', t);
    execute format('create policy admin_bypass on %I to bills_admin using (true) with check (true)', t);
  end loop;
end
$$;
