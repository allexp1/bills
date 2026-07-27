-- Multi-tenancy: web accounts on top of the existing customer rows, plus row
-- level security as the second of two isolation layers.
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
-- Row level security, applied to a dedicated role rather than to everyone
-- ---------------------------------------------------------------------------
-- The first draft of this migration used FORCE, which applies policies to the
-- table owner too. That would have been correct in a codebase where every
-- query carries tenant context, and wrong in this one: ten server files run
-- the ingestion pipeline, the crons and the share page with no session at all,
-- because a bill arrives from WhatsApp long before anyone visits the website.
-- RLS filters silently instead of erroring, so forcing it would have stopped
-- the bot dead without a single line in the logs.
--
-- So the split is by role. The pipeline keeps connecting as the owner and is
-- unaffected. The account surface connects as bills_tenant, where policies do
-- apply and a missing app.customer_id matches nothing. RLS therefore guards
-- exactly the surface that needed guarding: the new one, where rows are
-- selected on behalf of whoever is signed in.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'bills_tenant') then
    create role bills_tenant nologin;
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

grant usage on schema public to bills_tenant;
