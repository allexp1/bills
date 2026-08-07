-- Policies the customer holds, as listed by an official registry export
-- (Har haBituach). Lets the dashboard consolidate EVERYTHING held, not just
-- what was uploaded, and show which statements are missing.
--
-- NOT run by `drizzle-kit migrate` (only 0000 is journaled) — apply by hand,
-- same as 0004 onward.

create table if not exists "policy_holdings" (
  "id" text primary key,
  "customer_id" text not null references "customers"("id"),
  "invoice_id" text not null references "invoices"("id"),
  "family" text not null,
  "company" text not null,
  "product_name" text,
  "status" text not null default 'unknown',
  "country" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
create index if not exists "policy_holdings_customer_idx" on "policy_holdings" ("customer_id");

-- RLS, both layers, matching every other customer table:
--  - bills_app gets the permissive policy (pipeline writes without a session)
--  - bills_tenant sees only the session customer's rows (dashboard reads run
--    under withTenant, which switches role and sets app.customer_id)
alter table "policy_holdings" enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'policy_holdings' and policyname = 'bills_app_all_policy_holdings') then
    create policy "bills_app_all_policy_holdings"
      on "policy_holdings" for all to "bills_app" using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'policy_holdings' and policyname = 'tenant_own_policy_holdings') then
    create policy "tenant_own_policy_holdings"
      on "policy_holdings" for all to "bills_tenant"
      using ("customer_id" = current_setting('app.customer_id', true))
      with check ("customer_id" = current_setting('app.customer_id', true));
  end if;
end $$;

grant select, insert, update, delete on "policy_holdings" to "bills_app";
grant select, insert, update, delete on "policy_holdings" to "bills_tenant";
