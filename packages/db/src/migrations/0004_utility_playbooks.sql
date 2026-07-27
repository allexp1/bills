-- Researched, cached market knowledge per (country, utility).
-- Global and customer-free by design: public facts with cited sources, shared
-- across every customer and (later) every tenant.
create table if not exists "utility_playbooks" (
  "id" text primary key,
  "country" text not null,
  "utility" text not null,
  "version" integer not null default 1,
  "schema_version" integer not null default 1,
  "data" jsonb not null,
  "observations" jsonb,
  "bills_seen" integer not null default 0,
  "providers" jsonb,
  "model" text,
  "prompt_version" text,
  "status" text not null default 'ok',
  "researched_at" timestamptz not null default now(),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

create unique index if not exists "utility_playbooks_key_idx"
  on "utility_playbooks" ("country", "utility");
