-- Multi-tenancy: web accounts on top of the existing customer rows, plus row
-- level security as the second of two isolation layers.
--
-- NOT run by `drizzle-kit migrate`. meta/_journal.json lists only 0000, so
-- 0004, 0005 and this file are applied by hand, same as its predecessors.
--
-- Identity note. Customers already exist, keyed by WhatsApp id. Clerk becomes
-- the web login and is linked ONTO that same row rather than replacing it, so
-- someone who has been sending bills over WhatsApp for months signs in and
-- finds their history already there. Linking is by VERIFIED phone only: Clerk
-- proves ownership of the number and wa_hash is the same peppered hash of the
-- same number, so the join is safe. An email-only signup gets a fresh customer
-- row and links later, if and when a phone is verified.

alter table customers add column if not exists clerk_user_id text;
alter table customers add column if not exists email text;
alter table customers add column if not exists linked_at timestamptz;

create unique index if not exists customers_clerk_user_id_key
  on customers (clerk_user_id) where clerk_user_id is not null;

-- ---------------------------------------------------------------------------
-- Row level security, by role switch rather than a second connection
-- ---------------------------------------------------------------------------
-- Written against what the database actually looks like, which is not what the
-- first draft of this file assumed.
--
-- The app connects as bills_app, not as the table owner. RLS is already
-- enabled on all eight tables, and bills_app holds a permissive ALL policy, so
-- the pipeline, the crons and the share page read and write freely today. That
-- has to keep being true: a bill arrives from WhatsApp long before anyone
-- visits the website, and those paths carry no session to scope by.
--
-- So account traffic does not get its own connection. withTenant runs
-- SET LOCAL ROLE bills_tenant inside its transaction, which drops the
-- permissive bills_app policy for the rest of that transaction and leaves only
-- the tenant policies below. The role switch is local, so it unwinds on commit
-- or rollback and cannot leak to the next request on a pooled connection.
--
-- The policies compare against current_setting('app.customer_id', true).
-- missing_ok makes an unset value NULL, and NULL matches no row, so a query
-- that reaches the database under this role without tenant context returns
-- nothing rather than everything.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bills_tenant') then
    -- NOLOGIN on purpose: reached only via SET LOCAL ROLE, never dialled.
    create role bills_tenant nologin;
  end if;
end
$$;

grant bills_tenant to bills_app;
grant usage on schema public to bills_tenant;

-- Tables owning customer_id directly.
do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'conversations', 'authorizations', 'missions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on table %I to bills_tenant', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I to bills_tenant using (customer_id = current_setting(''app.customer_id'', true)) with check (customer_id = current_setting(''app.customer_id'', true))',
      t);
  end loop;
end
$$;

-- customers is keyed by id, not customer_id.
alter table customers enable row level security;
grant select, update on table customers to bills_tenant;
drop policy if exists tenant_isolation on customers;
create policy tenant_isolation on customers
  to bills_tenant
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
    execute format('grant select on table %I to bills_tenant', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I to bills_tenant using (exists (select 1 from invoices i where i.id = %I.invoice_id and i.customer_id = current_setting(''app.customer_id'', true)))',
      t, t);
  end loop;
end
$$;

-- messages reach the tenant through their conversation.
alter table messages enable row level security;
grant select on table messages to bills_tenant;
drop policy if exists tenant_isolation on messages;
create policy tenant_isolation on messages
  to bills_tenant
  using (exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and c.customer_id = current_setting('app.customer_id', true)
  ));
